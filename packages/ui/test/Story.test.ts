import { Command, Component, Route, Router, Subscription, View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Data, Effect, Layer, Option, Redacted, Schema, Stream } from "effect"
import { AsyncResult } from "effect/reactivity"
import {
  Counter,
  SaveTodo,
  Search,
  SearchBox,
  SearchMessage,
  TodoItem,
  TodoItemEvents,
  TodoItemMessage,
  TodoList,
  TodoListMessage,
  Upload
} from "./fixtures/components.ts"
import { BadgeRef, Note, NoteEvents, NoteMessage, SaveNote as SaveNoteCommand } from "./fixtures/notes.ts"
import * as users from "./fixtures/users.ts"

const todo = { id: "t1", title: "buy milk", done: false }
const todos = [todo, { id: "t2", title: "write spec", done: false }]

describe("Story", () => {
  it("delivers model-derived messages and validates subscription lifetimes", () => {
    const Message = Schema.TaggedUnion({ Set: { value: Schema.Number }, Stop: {} })
    const Receiver = Component.define({
      name: "Receiver",
      model: Schema.Number,
      message: Message,
      receives: ["Set"]
    }).make({
      init: () => 1,
      update: (_model, message) => message._tag === "Set" ? message.value : 0,
      subscriptions: (model) => model > 0 ? [Subscription.make("tick", Stream.empty)] : [],
      view: (model, h) => h.text(String(model))
    })
    const s = Story.start(Receiver, {})
    s.send((model) => ({ _tag: "Set", value: model + 1 }))
      .model((model) => assert.strictEqual(model, 2))
      .receive({ _tag: "Set", value: 3 })
      .model((model) => assert.strictEqual(model, 3))
      .receive((model) => ({ _tag: "Set", value: model * 2 }))
      .model((model) => assert.strictEqual(model, 6))
      .subscriptions((keys) => assert.deepStrictEqual(keys, ["tick"]))
    assert.throws(() => s.subscription("missing", { _tag: "Stop" }), /Story.subscription.*missing.*active keys:.*tick/)
    assert.throws(
      () => s.subscription("~query/users", { _tag: "Stop" }),
      /Story.subscription.*query watch.*active keys:.*tick/
    )
    s.subscription("tick", { _tag: "Stop" }).model((model) => assert.strictEqual(model, 0))
    assert.throws(() => s.subscription("tick", { _tag: "Set", value: 10 }), /active keys: \[\]/)
    s.model((model) => assert.strictEqual(model, 0))
  })

  it("subscription keys follow dependency keys and model changes", () => {
    const steps = Story.start(SearchBox, {})
    const tick = SearchMessage.make({ _tag: "Tick" })
    assert.throws(() => steps.subscription("tick", tick), /Story.subscription.*tick.*inactive.*active keys:.*query/)
    steps.subscription("query:\"\"", SearchMessage.make({ _tag: "Progress", percent: 50 }))
      .subscription("tick", tick)
      .model((model) => assert.strictEqual(model.ticks, 1))
      .subscription("tick", SearchMessage.make({ _tag: "Progress", percent: 100 }))
    assert.throws(() => steps.subscription("tick", tick), /active keys:.*query/)
    assert.strictEqual(steps.current.model.ticks, 1)
  })

  describe("Counter", () => {
    it("counts by clicking", () => {
      Scene.make(Counter, { initial: 1 }, (s) =>
        s.click("+")
          .click("+")
          .click("-")
          .expect(Locator.tag("span")).toHaveText("2")
          .view((view) => assert.strictEqual(View.textOf(view), "-2+")))
    })

    it("given starts from any Model, and a function of the cursor is a shared setup", () => {
      const twice = (s: Scene.Steps<typeof Counter>) => s.click("+").click("+")
      const scene = Scene.make(Counter, { initial: 1 }, (s) => s.given({ count: 10 }).pipe(twice))
      assert.strictEqual(Locator.textOf(scene.get(Locator.tag("span"))), "12")
    })

    it("a block callback runs every step without returning the cursor", () => {
      const scene = Scene.make(Counter, { initial: 0 }, (s) => {
        s.click("+")
        s.click("+")
      })
      assert.strictEqual(Locator.textOf(scene.get(Locator.tag("span"))), "2")
    })

    it("a step shared by any component keeps the caller's type", () => {
      const clickPlus = <S extends Scene.Steps.Any>(s: S): S => s.click("+")
      Scene.make(Counter, { initial: 0 }, (s) => s.pipe(clickPlus).expect(Locator.tag("span")).toHaveText("1"))
    })

    it("the record answers locator queries over the view", () => {
      const scene = Scene.start(Counter, { initial: 3 }).current
      assert.strictEqual(Locator.textOf(scene.get(Locator.tag("span"))), "3")
      assert.lengthOf(scene.all(Locator.tag("button")), 2)
      assert.isUndefined(scene.query(Locator.text("missing")))
      assert.strictEqual<unknown>(scene.root, scene.view())
    })
  })

  describe("events", () => {
    const Message = Schema.TaggedUnion({ Typed: { value: Schema.String }, Pressed: {} })
    const Form = Component.define({
      name: "Form",
      model: Schema.Struct({ value: Schema.String, presses: Schema.Number }),
      message: Message
    }).make({
      init: () => ({ value: "", presses: 0 }),
      update: (model, message) =>
        Message.match(message, {
          Typed: ({ value }) => ({ ...model, value }),
          Pressed: () => ({ ...model, presses: model.presses + 1 })
        }),
      view: (model, h) =>
        h.el(
          "div",
          h.el("input").attr("data-testid", "name").on(
            "input",
            (payload: unknown) => Message.make({ _tag: "Typed", value: (payload as { readonly value: string }).value })
          ),
          h.el("button").on("click", Message.make({ _tag: "Pressed" })).children(h.el("span", "Save")),
          h.el("p", "Save draft"),
          h.el("p", "plain"),
          h.el("output").attr("data-testid", "value").children(model.value),
          h.el("output").attr("data-testid", "presses").children(String(model.presses))
        )
    })

    it("fire sends the payload to the element the locator matches", () => {
      Scene.make(Form, {}, (s) =>
        s.fire(Locator.testId("name"), "input", { value: "Ada" })
          .expect(Locator.testId("value")).toHaveText("Ada"))
    })

    it("click bubbles from the matched element to the nearest ancestor that handles it", () => {
      Scene.make(Form, {}, (s) =>
        s.click(Locator.text("Save", { exact: true }))
          .click(Locator.tag("span"))
          .expect(Locator.testId("presses")).toHaveText("2"))
    })

    it("a locator that matches nothing or several elements throws", () => {
      assert.throws(() => Scene.start(Form, {}).click("Save"), /Scene\.click: 2 elements match text "Save"/)
      assert.throws(() => Scene.start(Form, {}).click("missing"), /Scene\.click: nothing matches text "missing"/)
    })

    it("an element nothing handles the event for throws", () => {
      assert.throws(
        () => Scene.start(Form, {}).click("plain"),
        /Scene\.click: nothing handles "click" at text "plain"/
      )
      assert.throws(
        () => Scene.start(Form, {}).fire(Locator.testId("name"), "change"),
        /Scene\.fire: nothing handles "change"/
      )
    })

    it("defaultPrevented reports a cancelled default until the next step that makes a record", () => {
      const Sent = Schema.TaggedUnion({ Send: {} })
      const Composer = Component.define({
        name: "Composer",
        model: Schema.Number,
        message: Sent
      }).make({
        init: () => 0,
        update: (sent) => sent + 1,
        view: (sent, h) =>
          h.el(
            "div",
            h.el("textarea").on(
              "keydown",
              (payload: unknown) =>
                (payload as { readonly key: string }).key === "Enter" ? Sent.make({ _tag: "Send" }) : undefined,
              { preventDefault: true }
            ),
            h.el("form").on("submit", () => undefined).children(h.el("button", "Ignored")),
            h.el("form", h.el("button", "Unhandled")),
            h.el("p").on("contextmenu", () => undefined, { preventDefault: "always" }).children("Menu"),
            h.el("output", String(sent))
          )
      })
      const keyDown = (key: string) => (s: Scene.Steps<typeof Composer>) =>
        s.fire(Locator.tag("textarea"), "keydown", { key })
      Scene.make(Composer, {}, (s) => {
        s.pipe(keyDown("Enter"))
          // Checks read the record without making a new one.
          .expect(Locator.tag("output")).toHaveText("1")
          .check((scene) => assert.isTrue(scene.defaultPrevented))
          .props({})
          .check((scene) => assert.isFalse(scene.defaultPrevented))
          .pipe(keyDown("Enter"))
          .pipe(keyDown("a"))
          .expectIgnored()
          .check((scene) => assert.isFalse(scene.defaultPrevented))
        // A form's submission is always cancelled, whatever its handler returns.
        s.fire(Locator.text("Ignored"), "submit").expectIgnored()
        assert.isTrue(s.current.defaultPrevented)
        // A form with no submit handler is like any element nothing handles the event for.
        assert.throws(() => s.fire(Locator.text("Unhandled"), "submit"), /Scene\.fire: nothing handles "submit"/)
        s.expect(Locator.tag("output")).toHaveText("2")
        // "always" cancels whatever the handler returns.
        s.fire(Locator.text("Menu"), "contextmenu").expectIgnored()
        assert.isTrue(s.current.defaultPrevented)
      })
    })
  })

  describe("TodoItem", () => {
    it("reports a toggle to its parent instead of changing the todo", () => {
      Scene.make(TodoItem, { todo }, (s) =>
        s.click("[ ]")
          .emitted(TodoItemEvents.make({ _tag: "Toggled", done: true })))
    })

    it("a props change re-renders without reaching update", () => {
      Scene.make(TodoItem, { todo }, (s) =>
        s.props({ todo: { ...todo, done: true } })
          .view((view) => assert.include(View.textOf(view), "[x]"))
          .expect(Locator.text("save", { exact: true })).toExist())
    })

    it("a Command stays pending as data until the test resolves it", () => {
      Scene.make(TodoItem, { todo }, (s) =>
        s.click("save")
          .expect(Locator.text("saving")).toExist()
          .expectExact(SaveTodo.make(todo))
          .expectHas(SaveTodo)
          .check((scene) => {
            assert.deepStrictEqual(
              scene.pending.map((entry) => [entry.command.name, entry.command.args, entry.status]),
              [["todos/SaveTodo", todo, "running"]]
            )
          })
          .resolve(SaveTodo, TodoItemMessage.make({ _tag: "SaveFailed", reason: "disk full" }))
          .expect(Locator.text("save", { exact: true })).toExist()
          .expectNone())
    })

    it("fails when a Command is still pending at the end", () => {
      assert.throws(
        () => Story.make(TodoItem, { todo }, (s) => s.send(TodoItemMessage.make({ _tag: "Save" }))),
        /Story\.make: the test ends with work not settled or acknowledged:\n.*todos\/SaveTodo.* \[running\] is pending/
      )
    })

    it("resolving by instance matches the arguments", () => {
      assert.throws(
        () =>
          Scene.make(TodoItem, { todo }, (s) =>
            s.click("save")
              .resolve(SaveTodo.make({ ...todo, id: "other" }), TodoItemMessage.make({ _tag: "Saved" }))),
        /no running todos\/SaveTodo/
      )
    })
  })

  describe("Commands that can fail", () => {
    class SaveFailed extends Data.TaggedError("SaveFailed")<{ readonly reason: string }> {}
    class Save extends Command.Service<Save>()(
      "test/Save",
      { args: { title: Schema.String }, invalidates: () => [] },
      Effect.succeed((): Effect.Effect<void, SaveFailed> => Effect.void)
    ) {}
    const Msg = Schema.TaggedUnion({ Save: {}, Saved: {}, Failed: { reason: Schema.String }, Stop: {} })
    const Editor = Component.define({
      name: "Editor",
      model: Schema.String,
      message: Msg
    }).make({
      init: () => "idle",
      update: (_, message, $) =>
        Msg.match(message, {
          Save: () =>
            $.run(
              Save.make({ title: "milk" }).pipe(Command.match({
                onSuccess: () => Msg.make({ _tag: "Saved" }),
                onFailure: (error) => Msg.make({ _tag: "Failed", reason: error.reason })
              }))
            ),
          Saved: () => "saved",
          Failed: ({ reason }) => `failed: ${reason}`,
          Stop: () => $.run(Command.interrupt(Save))
        }),
      view: (model, h) =>
        h.el("div", [
          h.el("button").on("click", Msg.make({ _tag: "Save" })).children("save"),
          h.el("button").on("click", Msg.make({ _tag: "Stop" })).children("stop"),
          h.text(h.isRunning(Save) ? "saving" : model)
        ])
    })

    it("fail sends the typed failure through Command.match", () => {
      Scene.make(Editor, {}, (s) =>
        s.click("save")
          .fail(Save, new SaveFailed({ reason: "disk full" }))
          .view((view) => assert.include(View.textOf(view), "failed: disk full")))
    })

    it("fail throws for a Command with no typed failure", () => {
      assert.throws(
        () => Scene.make(TodoItem, { todo }, (s) => s.click("save").fail(SaveTodo as any, new Error("no"))),
        /has no typed failure mapped by Command\.match/
      )
    })

    it("h.isRunning is derived from the pending Commands", () => {
      Scene.make(Editor, {}, (s) =>
        s.view((view) => assert.include(View.textOf(view), "idle"))
          .click("save")
          .view((view) => assert.include(View.textOf(view), "saving"))
          .resolve(Save, undefined)
          .view((view) => assert.include(View.textOf(view), "saved"))
          .click("save")
          .keepPending(Save)
          .click("stop")
          .view((view) => assert.include(View.textOf(view), "saved"))
          .expectNone())
    })
  })

  describe("TodoList", () => {
    it("declares one keyed child per todo", () => {
      const scene = Scene.start(TodoList, { initial: todos }).current
      assert.deepStrictEqual(Scene.children(scene.view(), TodoItem).map((child) => child.key), ["t1", "t2"])
    })

    it("reacts to what a child emits", () => {
      Scene.make(
        TodoList,
        { initial: todos },
        (s) =>
          s.childEmit(TodoItem, "t2", TodoItemEvents.make({ _tag: "Toggled", done: true }))
            .view((view) =>
              assert.deepStrictEqual(
                Scene.children(view, TodoItem).map((child) =>
                  (child.props as { readonly todo: typeof todo }).todo.done
                ),
                [false, true]
              )
            )
      )
    })

    it("hears about a child's failure and shows the child's fallback", () => {
      const failure = AsyncResult.failure<never, unknown>(Cause.die(new Error("boom")))
      Scene.make(TodoList, { initial: todos }, (s) =>
        s.childFailure("t1", failure.cause)
          .view((view) => {
            const fallback = Scene.fallback(view, "t1", failure)
            assert.strictEqual(View.textOf(fallback!), "buy milk failed")
          })
          .expect(Locator.text("rows failed: t1")).toExist())
      Story.start(TodoList, { initial: todos }).layerFailed(failure)
        .model((model) => assert.deepStrictEqual(model.failed, []))
    })

    it("applies Component.provide's onFailure", () => {
      const Provided = Component.provide(
        TodoList,
        () => Layer.effect(SaveTodo, Effect.fail("offline" as const)),
        { onFailure: () => TodoListMessage.make({ _tag: "RowFailed", id: "layer" }) }
      )
      Story.start(Provided, { initial: todos }).layerFailed(AsyncResult.failure(Cause.fail("offline")))
        .model((model) => assert.deepStrictEqual(model.failed, ["layer"]))
    })
  })

  describe("Command modes", () => {
    it("switch interrupts the earlier run, and the result arrives once", () => {
      Story.make(SearchBox, {}, (s) =>
        s.send(SearchMessage.make({ _tag: "Query", text: "a" }))
          .send(SearchMessage.make({ _tag: "Query", text: "ab" }))
          .check((story) => {
            assert.deepStrictEqual(story.interrupted.map((command) => command.args), [{ text: "a" }])
          })
          .expectExact(Search({ text: "ab" }))
          .resolve(Search, SearchMessage.make({ _tag: "Results", items: ["ab"] }))
          .model((model) => assert.deepStrictEqual(model.items, ["ab"])))
    })

    it("a stream Command takes next and end, drop ignores a second start, and an interrupt stops it", () => {
      Story.make(SearchBox, {}, (s) =>
        s.send(SearchMessage.make({ _tag: "Start" }))
          .send(SearchMessage.make({ _tag: "Start" }))
          .check((story) => assert.strictEqual(story.dropped.length, 1))
          .next(Upload, SearchMessage.make({ _tag: "Progress", percent: 50 }))
          .model((model) => assert.strictEqual(model.percent, 50))
          .subscriptions((keys) => assert.deepStrictEqual(keys, ["tick", "query:\"\""]))
          .expectHas(Upload)
          .send(SearchMessage.make({ _tag: "Cancel" }))
          .check((story) => assert.deepStrictEqual(story.interrupted.map((command) => command.name), ["Upload"]))
          .expectNone()
          .send(SearchMessage.make({ _tag: "Start" }))
          .end(Upload)
          .expectNone())
    })

    it("next and end reject a Command that isn't a stream", () => {
      assert.throws(
        () =>
          Story.make(SearchBox, {}, (s) =>
            s.send(SearchMessage.make({ _tag: "Query", text: "a" }))
              .next(Search as any, SearchMessage.make({ _tag: "Tick" }))),
        /not a stream Command/
      )
    })
  })

  describe("Command.map", () => {
    const Message = Schema.TaggedUnion({ Upload: {}, Uploaded: { url: Schema.String } })
    const UploadFile = Command.make(
      "UploadFile",
      { args: { name: Schema.String } },
      ({ name }) => Effect.succeed(`https://cdn/${name}`)
    )
    const Avatar = Component.define({
      name: "Avatar",
      model: Schema.Struct({ url: Schema.String }),
      message: Message
    }).make({
      init: () => ({ url: "" }),
      update: (_model, message, $) =>
        Message.match(message, {
          Upload: () =>
            $.run(UploadFile({ name: "me.png" }).pipe(Command.map((url) => Message.make({ _tag: "Uploaded", url })))),
          Uploaded: ({ url }) => ({ url })
        }),
      view: (model, h) => h.el("img").attr("src", model.url)
    })

    it("resolves with the Command's own message type and replays the mapping", () => {
      Story.make(Avatar, {}, (s) =>
        s.send(Message.make({ _tag: "Upload" }))
          .expectExact(UploadFile({ name: "me.png" }))
          .resolve(UploadFile, "https://cdn/me.png")
          .model((model) => assert.strictEqual(model.url, "https://cdn/me.png")))
    })

    it("a mapped Command as the target still takes the definition's own result", () => {
      const mapped = UploadFile({ name: "me.png" }).pipe(Command.map((url) => Message.make({ _tag: "Uploaded", url })))
      Story.make(Avatar, {}, (s) =>
        s.send(Message.make({ _tag: "Upload" }))
          .resolve(mapped, "https://cdn/me.png")
          .model((model) => assert.strictEqual(model.url, "https://cdn/me.png")))
    })
  })

  describe("navigation", () => {
    const AppRoute = Route.union({ Home: Route.make("/"), About: Route.make("/about") })
    const Message = Schema.TaggedUnion({
      Go: {},
      Navigated: { outcome: Schema.Literals(["navigated", "blocked"]) }
    })
    const Nav = Component.define({
      name: "Nav",
      model: Schema.Struct({ outcome: Schema.String }),
      message: Message
    }).make({
      init: () => ({ outcome: "" }),
      update: (_model, message, $) =>
        Message.match(message, {
          Go: () =>
            $.run(
              Router.push(AppRoute, AppRoute.make({ _tag: "About" })).pipe(
                Command.map((outcome) => Message.make({ _tag: "Navigated", outcome }))
              )
            ),
          Navigated: ({ outcome }) => ({ outcome })
        }),
      view: (model, h) => h.el("p", model.outcome)
    })

    it("a navigation Command stays pending until resolved, like any other", () => {
      Story.make(Nav, {}, (s) =>
        s.send(Message.make({ _tag: "Go" }))
          .model((model) => assert.strictEqual(model.outcome, ""))
          .resolve(Router.Push, "navigated")
          .model((model) => assert.strictEqual(model.outcome, "navigated")))
    })

    it("a search patch is named by its class, issued with the patch, and resolves with its own outcome", () => {
      const Routes = Route.union({ Search: Route.make("/search", { search: { q: Schema.optional(Schema.String) } }) })
      const BoxMessage = Schema.TaggedUnion({
        Typed: { value: Schema.String },
        Patched: { outcome: Schema.Literals(["navigated", "blocked", "stale"]) }
      })
      const Box = Component.define({
        name: "Box",
        props: Schema.Struct({ route: Routes }),
        model: Schema.Struct({ outcome: Schema.String }),
        message: BoxMessage
      }).make({
        init: () => ({ outcome: "" }),
        update: (_model, message, $) =>
          BoxMessage.match(message, {
            Typed: ({ value }) =>
              $.run(
                Router.patchSearch(Routes, $.props.route, { q: value || undefined }).pipe(
                  Command.map((outcome) => BoxMessage.make({ _tag: "Patched", outcome }))
                )
              ),
            Patched: ({ outcome }) => ({ outcome })
          }),
        view: (model, h) => h.el("p", model.outcome)
      })
      const route = Routes.make({ _tag: "Search" })
      Story.make(Box, { route }, (s) =>
        s.send(BoxMessage.make({ _tag: "Typed", value: "ada" }))
          .expectExact(Router.patchSearch(Routes, route, { q: "ada" }))
          .resolve(Router.PatchSearch, "stale")
          .model((model) => assert.strictEqual(model.outcome, "stale")))
    })
  })

  describe("view defects", () => {
    const Message = Schema.TaggedUnion({ Bump: {} })
    const Broken = Component.define({
      name: "Broken",
      model: Schema.Struct({ n: Schema.Number }),
      message: Message
    }).make({
      init: () => ({ n: 0 }),
      update: (model) => ({ n: model.n + 1 }),
      view: (model, h) => {
        if (model.n > 0) throw new Error(`view broke at ${model.n}`)
        return h.el("button").on("click", Message.make({ _tag: "Bump" })).children("bump")
      }
    })

    it("fail the step that changed the Model, even when no step queries the view", () => {
      Scene.make(Broken, {}, () => {})
      assert.throws(() => Scene.make(Broken, {}, (s) => s.click("bump")), /view broke at 1/)
    })

    it("fail initialisation when init's Model can't be rendered", () => {
      assert.throws(() => Scene.make(Broken, {}, (s) => s.given({ n: 5 })), /view broke at 5/)
      const AlwaysBroken = Component.define({
        name: "AlwaysBroken",
        model: Schema.Struct({}),
        message: Message
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: () => {
          throw new Error("no view")
        }
      })
      assert.throws(() => Scene.make(AlwaysBroken, {}, () => {}), /no view/)
    })
  })

  describe("queries", () => {
    it("lists the queries on the record from make, current and check, beside their results", () => {
      const names = (record: Story.Story<any, any, any, any>) => record.queryInfo().map((info) => info.name)
      const final = Story.make(Note, { author: "1" }, (s) => {
        assert.deepStrictEqual(names(s.current), ["author"])
        s.loaded("author", { id: "1", name: "Ann", email: "", likes: 0 })
          .check((story) => assert.deepStrictEqual(names(story), ["author"]))
      })
      assert.deepStrictEqual(names(final), ["author"])
      assert.strictEqual(final.queries().author._tag, "Success")
    })

    const text = (scene: { readonly root: Locator.Node }) => Locator.textOf(scene.root)
    const page = (n: number, names: ReadonlyArray<string>) => ({
      page: n,
      pages: 2,
      users: names.map((name, i) => ({ id: `${n}-${i}`, name, email: "", likes: 0 }))
    })

    it("loaded writes the query's result, at the query's current args", () => {
      Scene.make(users.ListPage, {}, (s) =>
        s
          .check((scene) => assert.include(text(scene), "Loading users…"))
          .queryInfo((info) =>
            assert.deepStrictEqual(info, [{ name: "users", query: "users/ListUsers", args: { page: 0 } }])
          )
          .loaded("users", page(0, ["Ann", "Bea"]))
          .check((scene) => assert.include(text(scene), "AnnBea"))
          // The next page: h.previous keeps the page the result holds until it is loaded.
          .click("Next")
          .queryInfo((info) => assert.deepStrictEqual(info.map((query) => query.args), [{ page: 1 }]))
          .check((scene) => {
            assert.include(text(scene), "AnnBea")
            assert.include(text(scene), "Loading page 2…")
          })
          .loaded("users", page(1, ["Cy"]))
          .check((scene) => {
            assert.include(text(scene), "Cy")
            assert.notInclude(text(scene), "Loading page")
          }))
    })

    it("loadFailed keeps the query's Success at the current args as previousSuccess, and waiting shows", () => {
      Scene.make(users.UserCard, { id: "1" }, (s) =>
        s
          .loaded("user", { id: "1", name: "Ann", email: "ann@x", likes: 0 }, { waiting: true })
          .check((scene) => assert.include(text(scene), "Updating…"))
          .loadFailed("user", new users.UserNotFound({ id: "1" }))
          .check((scene) => assert.strictEqual(text(scene), "This user doesn't exist.")))
      Story.make(users.UserCard, { id: "1" }, (s) =>
        s
          .loaded("user", { id: "1", name: "Ann", email: "ann@x", likes: 0 }, { waiting: true })
          .loadFailed("user", new users.UserNotFound({ id: "1" }))
          .check((story) => {
            const result = story.queries().user
            assert.isTrue(AsyncResult.isFailure(result) && Option.isSome(result.previousSuccess))
          })
          // Another user's result doesn't carry over.
          .props({ id: "2" })
          .loadFailed("user", new users.UserNotFound({ id: "2" }))
          .check((story) => {
            const result = story.queries().user
            assert.isTrue(AsyncResult.isFailure(result) && Option.isNone(result.previousSuccess))
          }))
    })

    it("given takes an updater and keeps the results, and loaded throws for a name that isn't a query", () => {
      Story.make(users.RenameForm, { id: "1" }, (s) =>
        s
          .given((model) => ({ ...model, draft: Option.some("Zed") }))
          .loaded("user", { id: "1", name: "Ann", email: "", likes: 0 })
          .check((story) => assert.strictEqual(story.model.draft._tag, "Some"))
          .given((model) => ({ ...model, draft: Option.none() }))
          .check((story) => {
            assert.strictEqual(story.model.draft._tag, "None")
            assert.strictEqual(story.queries().user._tag, "Success")
          })
          .subscriptions((keys) => assert.deepStrictEqual(keys, [])))
      assert.throws(
        () => Story.make(users.RenameForm, { id: "1" }, (s) => s.loaded("draft" as any, "x")),
        /draft/
      )
    })

    it("loaded and loadFailed name the Story step in their errors", () => {
      assert.throws(
        () => Story.make(users.RenameForm, { id: "1" }, (s) => s.loaded("draft" as any, "x")),
        /^Story\.loaded: "draft" is not a query of /
      )
      assert.throws(
        () => Story.make(users.RenameForm, { id: "1" }, (s) => s.loadFailed("draft" as any, "x")),
        /^Story\.loadFailed: "draft" is not a query of /
      )
    })

    const TeamMessage = Schema.TaggedUnion({ UserChanged: {}, Bump: {} })
    const renders: Array<string> = []
    const Team = Component.define({
      name: "Team",
      props: Schema.Struct({ id: Schema.String }),
      model: Schema.Struct({ changes: Schema.Number }),
      message: TeamMessage,
      elements: Html,
      queries: {
        // Declared before the query it depends on, so the order of the record doesn't matter.
        friend: {
          query: users.GetUser,
          args: (_model, _props, loaded) =>
            AsyncResult.isSuccess(loaded.user) ? { id: loaded.user.value.email } : undefined
        },
        user: {
          query: users.GetUser,
          args: (_model, props) => ({ id: props.id }),
          onChange: () => TeamMessage.make({ _tag: "UserChanged" })
        },
        others: { queryMany: users.GetUser, args: () => [{ id: "8" }, { id: "9" }] },
        list: { query: users.ListUsers, args: () => ({ page: 0 }) }
      }
    }).make({
      init: () => ({ changes: 0 }),
      update: (model) => ({ changes: model.changes + 1 }),
      view: (model, h) => {
        const name = (result: AsyncResult.AsyncResult<users.User, unknown>) =>
          AsyncResult.isSuccess(result) ? result.value.name : "?"
        const out = [
          name(h.queries.user),
          name(h.queries.friend),
          h.queries.others.map((entry) => name(entry.result)).join("+"),
          AsyncResult.isSuccess(h.queries.list) ? String(h.queries.list.value.users.length) : "?",
          String(model.changes)
        ].join(" ")
        renders.push(out)
        return h.p(out)
      }
    })
    const user = (id: string, name: string, email = "") => ({ id, name, email, likes: 0 })

    it("given starts from loaded results: one render, dependent and keyed queries, and no onChange message", () => {
      const loaded = {
        friend: user("2", "Bea"),
        user: user("1", "Ann", "2"),
        others: [{ args: { id: "9" }, value: user("9", "Ivy") }],
        list: { page: 0, pages: 1, users: [user("1", "Ann")] }
      }
      Scene.make(Team, { id: "1" }, (s) => {
        renders.length = 0
        s.given({ changes: 0 }, loaded)
          .check((scene) => assert.strictEqual(text(scene), "Ann Bea ?+Ivy 1 0"))
          // A load step after it still sends onChange.
          .loaded("user", user("1", "Anna", "2"))
          .check((scene) => assert.strictEqual(text(scene), "Anna Bea ?+Ivy 1 1"))
          .keepPending("others")
      })
      assert.deepStrictEqual(renders, ["Ann Bea ?+Ivy 1 0", "Anna Bea ?+Ivy 1 1"])
      const final = Story.make(
        Team,
        { id: "1" },
        (s) => s.given({ changes: 0 }, loaded).loaded("user", user("1", "Anna", "2")).keepPending("others")
      )
      assert.strictEqual(final.queries().friend._tag, "Success")
      assert.throws(
        () => Story.make(Team, { id: "1" }, (s) => s.given({ changes: 0 }, { friend: user("2", "Bea") })),
        /friend.*disabled/
      )
      // A keyed entry at args the query doesn't return.
      assert.throws(
        () =>
          Story.make(
            Team,
            { id: "1" },
            (s) => s.given({ changes: 0 }, { others: [{ args: { id: "7" }, value: user("7", "Uma") }] })
          ),
        /others.*given args/
      )
      // Queries that aren't named keep their results.
      Scene.make(Team, { id: "1" }, (s) =>
        s.given({ changes: 0 }, { user: user("1", "Ann", "2") })
          .given({ changes: 5 }, { friend: user("2", "Bea") })
          .check((scene) => assert.strictEqual(text(scene), "Ann Bea ?+? ? 5"))
          .keepPending("others")
          .keepPending("list"))
    })

    it("given replaces loaded results in any key order, against the new results, not the ones held before", () => {
      Scene.make(
        Team,
        { id: "1" },
        (s) =>
          s.given({ changes: 0 }, { user: user("1", "Ann", "2"), friend: user("2", "Bea") })
            .check((scene) => assert.strictEqual(text(scene), "Ann Bea ?+? ? 0"))
            // The friend is named first, while the held user still points at "2".
            .given({ changes: 0 }, { friend: user("3", "Cy"), user: user("1", "Ann", "3") })
            .check((scene) => assert.strictEqual(text(scene), "Ann Cy ?+? ? 0"))
            .keepPending("others")
            .keepPending("list")
      )
    })

    it("given prunes a keyed query with no onChange message, and a later step's prune still sends it", () => {
      const Message = Schema.TaggedUnion({ FriendsChanged: {} })
      const Pals = Component.define({
        name: "Pals",
        props: Schema.Struct({ id: Schema.String }),
        model: Schema.Struct({ changes: Schema.Number }),
        message: Message,
        elements: Html,
        queries: {
          user: { query: users.GetUser, args: (_model, props) => ({ id: props.id }) },
          friends: {
            queryMany: users.GetUser,
            args: (_model, _props, loaded) =>
              AsyncResult.isSuccess(loaded.user) ? [{ id: loaded.user.value.email }] : [],
            onChange: () => Message.make({ _tag: "FriendsChanged" })
          }
        }
      }).make({
        init: () => ({ changes: 0 }),
        update: (model) => ({ changes: model.changes + 1 }),
        view: (model, h) =>
          h.p(`${h.queries.friends.filter((entry) => AsyncResult.isSuccess(entry.result)).length} ${model.changes}`)
      })
      Scene.make(
        Pals,
        { id: "1" },
        (s) =>
          s.given({ changes: 0 }, {
            user: user("1", "Ann", "2"),
            friends: [{ args: { id: "2" }, value: user("2", "Bea") }]
          })
            .check((scene) => assert.strictEqual(text(scene), "1 0"))
            // The friend id moves to "3": the held "2" is pruned, silently.
            .given({ changes: 0 }, { user: user("1", "Ann", "3") })
            .check((scene) => assert.strictEqual(text(scene), "0 0"))
            .loadedMany("friends", [{ args: { id: "3" }, value: user("3", "Cy") }])
            .check((scene) => assert.strictEqual(text(scene), "1 1"))
            // An ordinary step's prune sends onChange.
            .loaded("user", user("1", "Ann", "4"))
            .check((scene) => assert.strictEqual(text(scene), "0 2"))
            .keepPending("friends")
      )
    })

    it("given keeps a keyed result its query returns again once the given results settle", () => {
      const Message = Schema.TaggedUnion({ FriendsChanged: {} })
      const Circle = Component.define({
        name: "Circle",
        props: Schema.Struct({}),
        model: Schema.Struct({ id: Schema.String, changes: Schema.Number }),
        message: Message,
        elements: Html,
        queries: {
          // Declared before the query it reads, so a first pass sees the old user at the new Model's args.
          friends: {
            queryMany: users.GetUser,
            args: (_model, _props, loaded) =>
              AsyncResult.isSuccess(loaded.user) ? [{ id: loaded.user.value.email }] : [],
            onChange: () => Message.make({ _tag: "FriendsChanged" })
          },
          user: { query: users.GetUser, args: (model) => ({ id: model.id }) }
        }
      }).make({
        init: () => ({ id: "1", changes: 0 }),
        update: (model) => ({ ...model, changes: model.changes + 1 }),
        view: (model, h) =>
          h.p(
            `${
              h.queries.friends.map((entry) => AsyncResult.isSuccess(entry.result) ? entry.result.value.name : "?")
                .join(
                  "+"
                )
            } ${model.changes}`
          )
      })
      Scene.make(Circle, {}, (s) =>
        s.given({ id: "1", changes: 0 }, {
          user: user("1", "Ann", "shared"),
          friends: [{ args: { id: "shared" }, value: user("shared", "Sam") }]
        })
          .check((scene) => assert.strictEqual(text(scene), "Sam 0"))
          // The new user points at the same friend: the held result stays.
          .given({ id: "2", changes: 0 }, { user: user("2", "Bob", "shared") })
          .check((scene) => assert.strictEqual(text(scene), "Sam 0"))
          // A friend the new user doesn't point at is still dropped, silently.
          .given({ id: "3", changes: 0 }, { user: user("3", "Cy", "other") })
          .check((scene) => assert.strictEqual(text(scene), "? 0"))
          .keepPending("friends"))
    })

    it("given with no loaded results works on a component without queries", () => {
      Story.make(
        Counter,
        { initial: 0 },
        (s) => s.given({ count: 3 }, {}).check((story) => assert.strictEqual(story.model.count, 3))
      )
    })
  })

  describe("the acknowledgement rule", () => {
    describe("failure messages redact what the log redacts", () => {
      // Synthetic secrets. `at` fails to encode when it isn't finite, so the encoding falls back.
      const Secret = Schema.RedactedFromValue(Schema.String)
      const Receiver = Component.define({
        name: "SecretReceiver",
        model: Schema.Null,
        message: Schema.TaggedUnion({ Take: { token: Secret, at: Schema.Finite } }),
        receives: ["Take"],
        elements: Html
      }).make({ init: () => null, update: (model) => model, view: (_, h) => h.div })
      const ref = Receiver.ref("secret")
      const App = Component.define({
        name: "SecretOutputs",
        model: Schema.Null,
        message: Schema.Struct({ kind: Schema.Literals(["emit", "send"]), at: Schema.Number }),
        events: Schema.Struct({ token: Secret, at: Schema.Finite }),
        elements: Html
      }).make({
        init: () => null,
        update: (_, { at, kind }, $) =>
          kind === "emit"
            ? $.emit({ token: Redacted.make("synthetic-event-secret"), at })
            : $.send(ref, { _tag: "Take", token: Redacted.make("synthetic-send-secret"), at }),
        view: (_, h) => h.div
      })
      const errorOf = (f: () => unknown): string => {
        try {
          f()
        } catch (cause) {
          return (cause as Error).message
        }
        return assert.fail("expected a failure")
      }

      for (const kind of ["emit", "send"] as const) {
        for (const at of [1, Number.NaN]) {
          it(`${kind}, ${Number.isNaN(at) ? "falling back when it fails to encode" : "encoded"}`, () => {
            const message = { kind, at }
            const s = Story.start(App, {}).send(message)
            const messages = [
              errorOf(() => Story.make(App, {}, (s) => s.send(message))),
              errorOf(() => s.send(message)),
              errorOf(() =>
                kind === "emit"
                  ? s.emitted({ token: Redacted.make("synthetic-other-secret"), at })
                  : s.sent(ref, { _tag: "Take", token: Redacted.make("synthetic-other-secret"), at })
              )
            ]
            for (const text of messages) {
              assert.include(text, `{"~redacted":true}`)
              // When encoding fails, an event keeps its other fields with a placeholder for the failing one;
              // a send's union can't tell which member's secret it holds, so it is one placeholder.
              if (Number.isNaN(at)) {
                assert.include(
                  text,
                  kind === "emit" ? `"at":{"~unserialisable":"number"}` : `{"~redacted":true} to secret`
                )
              }
              assert.notMatch(text, /synthetic-\w+-secret/)
            }
          })
        }
      }
    })

    const edit = NoteMessage.make({ _tag: "Edit", text: "x" })
    const saved = NoteEvents.make({ _tag: "Saved", text: "" })

    it("a message step waits for a plain Command, and switch, queue, drop and stream Commands don't block it", () => {
      const s = Story.start(Note, {})
        .send(NoteMessage.make({ _tag: "Find", text: "a" }))
        .send(NoteMessage.make({ _tag: "Sync" }))
        .send(NoteMessage.make({ _tag: "Export" }))
        .send(NoteMessage.make({ _tag: "Follow" }))
        .send(NoteMessage.make({ _tag: "Save" }))
      assert.throws(
        () => s.send(edit),
        /^Story\.send: earlier work isn't settled or acknowledged:\n {2}- notes\/SaveNote\(\{"text":""\}\) \[running\] is pending/
      )
      s.keepPending(SaveNoteCommand).send(edit)
      // Exempt or kept, the end of make checks it.
      assert.throws(
        () => Story.make(Note, {}, (s) => s.send(NoteMessage.make({ _tag: "Find", text: "a" }))),
        /^Story\.make: the test ends with work not settled or acknowledged:\n {2}- notes\/FindNotes/
      )
    })

    it("an enabled query with no result blocks a message step and the end, unless kept", () => {
      assert.throws(() => Story.start(Note, { author: "1" }).send(edit), /the query "author" has no result/)
      assert.throws(
        () => Story.make(Note, { author: "1" }, () => {}),
        /^Story\.make: .*\n {2}- the query "author" has no result/
      )
      Story.make(Note, { author: "1" }, (s) => s.keepPending("author").send(edit))
      Story.make(
        Note,
        { author: "1" },
        (s) => s.loaded("author", { id: "1", name: "Ann", email: "", likes: 0 }).send(edit)
      )
    })

    it("emitted and sent take the values they acknowledge, and an acting step waits for them", () => {
      const s = Story.start(Note, {}).send(NoteMessage.make({ _tag: "Save" }))
        .resolve(SaveNoteCommand, NoteMessage.make({ _tag: "Saved" }))
      assert.throws(() => s.send(edit), /was emitted/)
      assert.throws(() => s.emitted(NoteEvents.make({ _tag: "Saved", text: "other" })), /^Story\.emitted: /)
      s.emitted(saved).send(NoteMessage.make({ _tag: "Clear" }))
      assert.throws(() => s.props({}), /was sent/)
      s.sent(BadgeRef, { _tag: "Clear" }).check((story) => assert.lengthOf(story.sent, 0))
      assert.throws(
        () => Story.make(Note, {}, (s) => s.send(NoteMessage.make({ _tag: "Clear" }))),
        /^Story\.make: .*\n {2}- .*Clear.* to Badge.* was sent/
      )
    })

    it("given replaces what init produced, and throws after an acting step rather than discard work", () => {
      const s = Story.start(Note, {}).send(NoteMessage.make({ _tag: "Save" }))
      assert.throws(() => s.given((model) => model), /^Story\.given: /)
      Story.make(
        Note,
        {},
        (s) => s.given((model) => ({ ...model, text: "kept" })).model((model) => assert.strictEqual(model.text, "kept"))
      )
      // A query a message enabled is work too: given can't disable it before it has a result.
      const author = NoteMessage.make({ _tag: "Author", id: "1" })
      assert.throws(
        () => Story.make(Note, {}, (s) => s.send(author).given((model) => ({ ...model, author: undefined }))),
        /^Story\.given: given would discard work not settled or acknowledged:\n {2}- the query "author" has no result, and given would drop it/
      )
      // Giving it a result, or leaving it waiting, discards nothing.
      Story.make(
        Note,
        {},
        (s) => s.send(author).given((model) => model, { author: { id: "1", name: "Ann", email: "", likes: 0 } })
      )
      Story.make(Note, {}, (s) => s.send(author).given((model) => model).keepPending("author"))
    })
  })
})
