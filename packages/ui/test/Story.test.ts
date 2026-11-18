import { Command, Component, Route, Router, Subscription, UiSchema, View } from "@effect/ui"
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
import { defect } from "./utils/scoped.ts"

const todo = { id: "t1", title: "buy milk", done: false }
const todos = [todo, { id: "t2", title: "write spec", done: false }]

describe("Story", () => {
  it("delivers model-derived messages and validates subscription lifetimes", () => {
    const Message = UiSchema.TaggedEnum({ Set: { value: Schema.Number }, Stop: {} })
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
    assert.strictEqual(s.model, 2)
    s.receive({ _tag: "Set", value: 3 })
    assert.strictEqual(s.model, 3)
    s.receive((model) => ({ _tag: "Set", value: model * 2 }))
    assert.strictEqual(s.model, 6)
    assert.deepStrictEqual(s.subscriptions, ["tick"])
    assert.throws(() => s.subscription("missing", { _tag: "Stop" }), /Story.subscription.*missing.*active keys:.*tick/)
    assert.throws(
      () => s.subscription("~query/users", { _tag: "Stop" }),
      /Story.subscription.*query watch.*active keys:.*tick/
    )
    s.subscription("tick", { _tag: "Stop" })
    assert.strictEqual(s.model, 0)
    assert.throws(() => s.subscription("tick", { _tag: "Set", value: 10 }), /active keys: \[\]/)
    assert.strictEqual(s.model, 0)
  })

  it("subscription keys follow dependency keys and model changes", () => {
    const steps = Story.start(SearchBox, {})
    const tick = SearchMessage.Tick()
    assert.throws(() => steps.subscription("tick", tick), /Story.subscription.*tick.*inactive.*active keys:.*query/)
    steps.subscription("query:\"\"", SearchMessage.Progress({ percent: 50 }))
      .subscription("tick", tick)
    assert.strictEqual(steps.model.ticks, 1)
    steps.subscription("tick", SearchMessage.Progress({ percent: 100 }))
    assert.throws(() => steps.subscription("tick", tick), /active keys:.*query/)
    assert.strictEqual(steps.current.model.ticks, 1)
  })

  describe("Counter", () => {
    it.effect("counts by clicking", () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(Counter, { initial: 1 })
        s.click("+")
          .click("+")
          .click("-")
          .expect(Locator.tag("span")).toHaveText("2")
        assert.strictEqual(View.textOf(s.view), "-2+")
      }))

    it.effect("given starts from any Model, and a function of the cursor is a shared setup", () =>
      Effect.gen(function*() {
        const twice = (s: Scene.Steps<typeof Counter>) => s.click("+").click("+")
        const s = yield* Scene.make(Counter, { initial: 1 })
        s.given({ count: 10 }).pipe(twice)
        assert.strictEqual(Locator.textOf(s.get(Locator.tag("span"))), "12")
      }))

    it.effect("steps run as separate statements on one cursor", () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(Counter, { initial: 0 })
        s.click("+")
        s.click("+")
        assert.strictEqual(Locator.textOf(s.get(Locator.tag("span"))), "2")
      }))

    it.effect("a step shared by any component keeps the caller's type", () =>
      Effect.gen(function*() {
        const clickPlus = <S extends Scene.Steps.Any>(s: S): S => s.click("+")
        const s = yield* Scene.make(Counter, { initial: 0 })
        s.pipe(clickPlus).expect(Locator.tag("span")).toHaveText("1")
      }))

    it("the record answers locator queries over the view", () => {
      const scene = Scene.start(Counter, { initial: 3 }).current
      assert.strictEqual(Locator.textOf(scene.get(Locator.tag("span"))), "3")
      assert.lengthOf(scene.all(Locator.tag("button")), 2)
      assert.isUndefined(scene.query(Locator.text("missing")))
      assert.strictEqual<unknown>(scene.root, scene.view())
    })
  })

  describe("events", () => {
    const Message = UiSchema.TaggedEnum({ Typed: { value: Schema.String }, Pressed: {} })
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
            (payload: unknown) => Message.Typed({ value: (payload as { readonly value: string }).value })
          ),
          h.el("button").on("click", Message.Pressed()).children(h.el("span", "Save")),
          h.el("p", "Save draft"),
          h.el("p", "plain"),
          h.el("output").attr("data-testid", "value").children(model.value),
          h.el("output").attr("data-testid", "presses").children(String(model.presses))
        )
    })

    it.effect("fire sends the payload to the element the locator matches", () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(Form, {})
        s.fire(Locator.testId("name"), "input", { value: "Ada" })
          .expect(Locator.testId("value")).toHaveText("Ada")
      }))

    it.effect("click bubbles from the matched element to the nearest ancestor that handles it", () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(Form, {})
        s.click(Locator.text("Save", { exact: true }))
          .click(Locator.tag("span"))
          .expect(Locator.testId("presses")).toHaveText("2")
      }))

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

    it.effect("defaultPrevented reports a cancelled default until the next step that makes a record", () =>
      Effect.gen(function*() {
        const Sent = UiSchema.TaggedEnum({ Send: {} })
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
                (payload: unknown) => (payload as { readonly key: string }).key === "Enter" ? Sent.Send() : undefined,
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
        const s = yield* Scene.make(Composer, {})
        s.pipe(keyDown("Enter"))
          // Checks read the record without making a new one.
          .expect(Locator.tag("output")).toHaveText("1")
        assert.isTrue(s.defaultPrevented)
        s.props({})
        assert.isFalse(s.defaultPrevented)
        s.pipe(keyDown("Enter"))
          .pipe(keyDown("a"))
          .expectIgnored()
        assert.isFalse(s.defaultPrevented)
        // A form's submission is always cancelled, whatever its handler returns.
        s.fire(Locator.text("Ignored"), "submit").expectIgnored()
        assert.isTrue(s.defaultPrevented)
        // A form with no submit handler is like any element nothing handles the event for.
        assert.throws(() => s.fire(Locator.text("Unhandled"), "submit"), /Scene\.fire: nothing handles "submit"/)
        s.expect(Locator.tag("output")).toHaveText("2")
        // "always" cancels whatever the handler returns.
        s.fire(Locator.text("Menu"), "contextmenu").expectIgnored()
        assert.isTrue(s.defaultPrevented)
      }))
  })

  describe("TodoItem", () => {
    it.effect("reports a toggle to its parent instead of changing the todo", () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(TodoItem, { todo })
        s.click("[ ]")
          .emitted(TodoItemEvents.Toggled({ done: true }))
      }))

    it.effect("a props change re-renders without reaching update", () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(TodoItem, { todo })
        s.props({ todo: { ...todo, done: true } })
        assert.include(View.textOf(s.view), "[x]")
        s.expect(Locator.text("save", { exact: true })).toExist()
      }))

    it.effect("a Command stays pending as data until the test resolves it", () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(TodoItem, { todo })
        s.click("save")
          .expect(Locator.text("saving")).toExist()
          .expectExact(SaveTodo.make(todo))
          .expectHas(SaveTodo)
        assert.deepStrictEqual(
          s.pending.map((entry) => [entry.command.name, entry.command.args, entry.status]),
          [["todos/SaveTodo", todo, "running"]]
        )
        s.resolve(SaveTodo, TodoItemMessage.SaveFailed({ reason: "disk full" }))
          .expect(Locator.text("save", { exact: true })).toExist()
          .expectNone()
      }))

    it.effect("fails when a Command is still pending at the end", () =>
      Effect.gen(function*() {
        const message = yield* defect(Effect.gen(function*() {
          const s = yield* Story.make(TodoItem, { todo })
          s.send(TodoItemMessage.Save())
        }))
        assert.match(
          message,
          /Story\.make: the test ends with work not settled or acknowledged:\n.*todos\/SaveTodo.* \[running\] is pending/
        )
      }))

    it("resolving by instance matches the arguments", () => {
      const s = Scene.start(TodoItem, { todo })
      assert.throws(
        () =>
          s.click("save")
            .resolve(SaveTodo.make({ ...todo, id: "other" }), TodoItemMessage.Saved()),
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
    const Msg = UiSchema.TaggedEnum({ Save: {}, Saved: {}, Failed: { reason: Schema.String }, Stop: {} })
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
                onSuccess: () => Msg.Saved(),
                onFailure: (error) => Msg.Failed({ reason: error.reason })
              }))
            ),
          Saved: () => "saved",
          Failed: ({ reason }) => `failed: ${reason}`,
          Stop: () => $.run(Command.interrupt(Save))
        }),
      view: (model, h) =>
        h.el("div", [
          h.el("button").on("click", Msg.Save()).children("save"),
          h.el("button").on("click", Msg.Stop()).children("stop"),
          h.text(h.isRunning(Save) ? "saving" : model)
        ])
    })

    it.effect("fail sends the typed failure through Command.match", () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(Editor, {})
        s.click("save")
          .fail(Save, new SaveFailed({ reason: "disk full" }))
        assert.include(View.textOf(s.view), "failed: disk full")
      }))

    it("fail throws for a Command with no typed failure", () => {
      const s = Scene.start(TodoItem, { todo })
      assert.throws(
        () => s.click("save").fail(SaveTodo as any, new Error("no")),
        /has no typed failure mapped by Command\.match/
      )
    })

    it.effect("h.isRunning is derived from the pending Commands", () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(Editor, {})
        assert.include(View.textOf(s.view), "idle")
        s.click("save")
        assert.include(View.textOf(s.view), "saving")
        s.resolve(Save, undefined)
        assert.include(View.textOf(s.view), "saved")
        s.click("save")
          .keepPending(Save)
          .click("stop")
        assert.include(View.textOf(s.view), "saved")
        s.expectNone()
      }))
  })

  describe("TodoList", () => {
    it("declares one keyed child per todo", () => {
      const scene = Scene.start(TodoList, { initial: todos }).current
      assert.deepStrictEqual(Scene.children(scene.view(), TodoItem).map((child) => child.key), ["t1", "t2"])
    })

    it.effect("reacts to what a child emits", () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(TodoList, { initial: todos })
        s.childEmit(TodoItem, "t2", TodoItemEvents.Toggled({ done: true }))
        assert.deepStrictEqual(
          Scene.children(s.view, TodoItem).map((child) => (child.props as { readonly todo: typeof todo }).todo.done),
          [false, true]
        )
      }))

    it.effect("hears about a child's failure and shows the child's fallback", () =>
      Effect.gen(function*() {
        const failure = AsyncResult.failure<never, unknown>(Cause.die(new Error("boom")))
        const s = yield* Scene.make(TodoList, { initial: todos })
        s.childFailure(TodoItem, "t1", failure.cause)
        const fallback = Scene.fallback(s.view, TodoItem, "t1", failure)
        assert.strictEqual(View.textOf(fallback!), "buy milk failed")
        s.expect(Locator.text("rows failed: t1")).toExist()
        const story = Story.start(TodoList, { initial: todos }).layerFailed(failure)
        assert.deepStrictEqual(story.model.failed, [])
      }))

    it("applies Component.provide's onFailure", () => {
      const Provided = Component.provide(
        TodoList,
        () => Layer.effect(SaveTodo, Effect.fail("offline" as const)),
        { onFailure: () => TodoListMessage.RowFailed({ id: "layer" }) }
      )
      const s = Story.start(Provided, { initial: todos }).layerFailed(AsyncResult.failure(Cause.fail("offline")))
      assert.deepStrictEqual(s.model.failed, ["layer"])
    })
  })

  describe("Command modes", () => {
    it.effect("switch interrupts the earlier run, and the result arrives once", () =>
      Effect.gen(function*() {
        const s = yield* Story.make(SearchBox, {})
        s.send(SearchMessage.Query({ text: "a" }))
          .send(SearchMessage.Query({ text: "ab" }))
        assert.deepStrictEqual(s.interrupted.map((command) => command.args), [{ text: "a" }])
        s.expectExact(Search({ text: "ab" }))
          .resolve(Search, SearchMessage.Results({ items: ["ab"] }))
        assert.deepStrictEqual(s.model.items, ["ab"])
      }))

    it.effect("a stream Command takes next and end, and an interrupt stops it", () =>
      Effect.gen(function*() {
        const s = yield* Story.make(SearchBox, {})
        s.send(SearchMessage.Start())
        s.next(Upload, SearchMessage.Progress({ percent: 50 }))
        assert.strictEqual(s.model.percent, 50)
        assert.deepStrictEqual(s.subscriptions, ["tick", "query:\"\""])
        s.expectHas(Upload)
          .send(SearchMessage.Cancel())
        assert.deepStrictEqual(s.interrupted.map((command) => command.name), ["Upload"])
        s.expectNone()
          .send(SearchMessage.Start())
          .end(Upload)
          .expectNone()
      }))

    it("next and end reject a Command that isn't a stream", () => {
      const s = Story.start(SearchBox, {}).send(SearchMessage.Query({ text: "a" }))
      assert.throws(
        () => s.next(Search as any, SearchMessage.Tick()),
        /not a stream Command/
      )
    })
  })

  describe("Command.map", () => {
    const Message = UiSchema.TaggedEnum({ Upload: {}, Uploaded: { url: Schema.String } })
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
          Upload: () => $.run(UploadFile({ name: "me.png" }).pipe(Command.map((url) => Message.Uploaded({ url })))),
          Uploaded: ({ url }) => ({ url })
        }),
      view: (model, h) => h.el("img").attr("src", model.url)
    })

    it.effect("resolves with the Command's own message type and replays the mapping", () =>
      Effect.gen(function*() {
        const s = yield* Story.make(Avatar, {})
        s.send(Message.Upload())
          .expectExact(UploadFile({ name: "me.png" }))
          .resolve(UploadFile, "https://cdn/me.png")
        assert.strictEqual(s.model.url, "https://cdn/me.png")
      }))

    it.effect("a mapped Command as the target still takes the definition's own result", () =>
      Effect.gen(function*() {
        const mapped = UploadFile({ name: "me.png" }).pipe(
          Command.map((url) => Message.Uploaded({ url }))
        )
        const s = yield* Story.make(Avatar, {})
        s.send(Message.Upload())
          .resolve(mapped, "https://cdn/me.png")
        assert.strictEqual(s.model.url, "https://cdn/me.png")
      }))
  })

  describe("navigation", () => {
    const AppRoute = Route.union({ Home: Route.make("/"), About: Route.make("/about") })
    const Message = UiSchema.TaggedEnum({
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
                Command.map((outcome) => Message.Navigated({ outcome }))
              )
            ),
          Navigated: ({ outcome }) => ({ outcome })
        }),
      view: (model, h) => h.el("p", model.outcome)
    })

    it.effect("a navigation Command stays pending until resolved, like any other", () =>
      Effect.gen(function*() {
        const s = yield* Story.make(Nav, {})
        s.send(Message.Go())
        assert.strictEqual(s.model.outcome, "")
        s.resolve(Router.Push, "navigated")
        assert.strictEqual(s.model.outcome, "navigated")
      }))

    it.effect("a search patch is named by its class, issued with the patch, and resolves with its own outcome", () =>
      Effect.gen(function*() {
        const Routes = Route.union({ Search: Route.make("/search", { search: { q: Schema.optional(Schema.String) } }) })
        const BoxMessage = UiSchema.TaggedEnum({
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
                    Command.map((outcome) => BoxMessage.Patched({ outcome }))
                  )
                ),
              Patched: ({ outcome }) => ({ outcome })
            }),
          view: (model, h) => h.el("p", model.outcome)
        })
        const route = Routes.make({ _tag: "Search" })
        const s = yield* Story.make(Box, { route })
        s.send(BoxMessage.Typed({ value: "ada" }))
          .expectExact(Router.patchSearch(Routes, route, { q: "ada" }))
          .resolve(Router.PatchSearch, "stale")
        assert.strictEqual(s.model.outcome, "stale")
      }))
  })

  describe("view defects", () => {
    const Message = UiSchema.TaggedEnum({ Bump: {} })
    const Broken = Component.define({
      name: "Broken",
      model: Schema.Struct({ n: Schema.Number }),
      message: Message
    }).make({
      init: () => ({ n: 0 }),
      update: (model) => ({ n: model.n + 1 }),
      view: (model, h) => {
        if (model.n > 0) throw new Error(`view broke at ${model.n}`)
        return h.el("button").on("click", Message.Bump()).children("bump")
      }
    })

    it.effect("fail the step that changed the Model, even when no step queries the view", () =>
      Effect.gen(function*() {
        yield* Scene.make(Broken, {})
        const s = Scene.start(Broken, {})
        assert.throws(() => s.click("bump"), /view broke at 1/)
      }))

    it.effect("fail initialisation when init's Model can't be rendered", () =>
      Effect.gen(function*() {
        const s = Scene.start(Broken, {})
        assert.throws(() => s.given({ n: 5 }), /view broke at 5/)
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
        const message = yield* defect(Scene.make(AlwaysBroken, {}))
        assert.match(message, /no view/)
      }))
  })

  describe("queries", () => {
    it.effect("lists the queries on the record from make, current and check, beside their results", () =>
      Effect.gen(function*() {
        const names = (record: Story.Story<any, any, any, any>) => record.queryInfo().map((info) => info.name)
        const s = yield* Story.make(Note, { author: "1" })
        assert.deepStrictEqual(names(s.current), ["author"])
        assert.deepStrictEqual(s.queryInfo, s.current.queryInfo())
        s.loaded("author", { id: "1", name: "Ann", email: "", likes: 0 })
          .check((story) => assert.deepStrictEqual(names(story), ["author"]))
        // The record make's cursor ends with, as the callback form returned it.
        assert.deepStrictEqual(names(s.current), ["author"])
        assert.strictEqual(s.current.queries().author._tag, "Success")
        assert.strictEqual(s.queries.author._tag, "Success")
      }))

    const text = (scene: { readonly root: Locator.Node }) => Locator.textOf(scene.root)
    const page = (n: number, names: ReadonlyArray<string>) => ({
      page: n,
      pages: 2,
      users: names.map((name, i) => ({ id: `${n}-${i}`, name, email: "", likes: 0 }))
    })

    it.effect("loaded writes the query's result, at the query's current args", () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(users.ListPage, {})
        assert.include(text(s), "Loading users…")
        assert.deepStrictEqual(s.queryInfo, [{ name: "users", query: "users/ListUsers", args: { page: 0 } }])
        s.loaded("users", page(0, ["Ann", "Bea"]))
        assert.include(text(s), "AnnBea")
        // The next page: h.previous keeps the page the result holds until it is loaded.
        s.click("Next")
        assert.deepStrictEqual(s.queryInfo.map((query) => query.args), [{ page: 1 }])
        assert.include(text(s), "AnnBea")
        assert.include(text(s), "Loading page 2…")
        s.loaded("users", page(1, ["Cy"]))
        assert.include(text(s), "Cy")
        assert.notInclude(text(s), "Loading page")
      }))

    it.effect("loadFailed keeps the query's Success at the current args as previousSuccess, and waiting shows", () =>
      Effect.gen(function*() {
        const scene = yield* Scene.make(users.UserCard, { id: "1" })
        scene.loaded("user", { id: "1", name: "Ann", email: "ann@x", likes: 0 }, { waiting: true })
        assert.include(text(scene), "Updating…")
        scene.loadFailed("user", new users.UserNotFound({ id: "1" }))
        assert.strictEqual(text(scene), "This user doesn't exist.")
        const story = yield* Story.make(users.UserCard, { id: "1" })
        story
          .loaded("user", { id: "1", name: "Ann", email: "ann@x", likes: 0 }, { waiting: true })
          .loadFailed("user", new users.UserNotFound({ id: "1" }))
        const kept = story.queries.user
        assert.isTrue(AsyncResult.isFailure(kept) && Option.isSome(kept.previousSuccess))
        // Another user's result doesn't carry over.
        story.props({ id: "2" })
          .loadFailed("user", new users.UserNotFound({ id: "2" }))
        const other = story.queries.user
        assert.isTrue(AsyncResult.isFailure(other) && Option.isNone(other.previousSuccess))
      }))

    it.effect("given takes an updater and keeps the results, and loaded throws for a name that isn't a query", () =>
      Effect.gen(function*() {
        const s = yield* Story.make(users.RenameForm, { id: "1" })
        s.given((model) => ({ ...model, draft: Option.some("Zed") }))
          .loaded("user", { id: "1", name: "Ann", email: "", likes: 0 })
        assert.strictEqual(s.model.draft._tag, "Some")
        s.given((model) => ({ ...model, draft: Option.none() }))
        assert.strictEqual(s.model.draft._tag, "None")
        assert.strictEqual(s.queries.user._tag, "Success")
        assert.deepStrictEqual(s.subscriptions, [])
        assert.throws(
          () => Story.start(users.RenameForm, { id: "1" }).loaded("draft" as any, "x"),
          /draft/
        )
      }))

    it("loaded and loadFailed name the Story step in their errors", () => {
      assert.throws(
        () => Story.start(users.RenameForm, { id: "1" }).loaded("draft" as any, "x"),
        /^Story\.loaded: "draft" is not a query of /
      )
      assert.throws(
        () => Story.start(users.RenameForm, { id: "1" }).loadFailed("draft" as any, "x"),
        /^Story\.loadFailed: "draft" is not a query of /
      )
    })

    const TeamMessage = UiSchema.TaggedEnum({ UserChanged: {}, Bump: {} })
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
          onChange: () => TeamMessage.UserChanged()
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

    it.effect("given starts from loaded results: one render, dependent and keyed queries, and no onChange message", () =>
      Effect.gen(function*() {
        const loaded = {
          friend: user("2", "Bea"),
          user: user("1", "Ann", "2"),
          others: [{ args: { id: "9" }, value: user("9", "Ivy") }],
          list: { page: 0, pages: 1, users: [user("1", "Ann")] }
        }
        const scene = yield* Scene.make(Team, { id: "1" })
        renders.length = 0
        scene.given({ changes: 0 }, loaded)
        assert.strictEqual(text(scene), "Ann Bea ?+Ivy 1 0")
        // A load step after it still sends onChange.
        scene.loaded("user", user("1", "Anna", "2"))
        assert.strictEqual(text(scene), "Anna Bea ?+Ivy 1 1")
        scene.keepPending("others")
        assert.deepStrictEqual(renders, ["Ann Bea ?+Ivy 1 0", "Anna Bea ?+Ivy 1 1"])
        const final = yield* Story.make(Team, { id: "1" })
        final.given({ changes: 0 }, loaded).loaded("user", user("1", "Anna", "2")).keepPending("others")
        assert.strictEqual(final.queries.friend._tag, "Success")
        assert.throws(
          () => Story.start(Team, { id: "1" }).given({ changes: 0 }, { friend: user("2", "Bea") }),
          /friend.*disabled/
        )
        // A keyed entry at args the query doesn't return.
        assert.throws(
          () =>
            Story.start(Team, { id: "1" }).given({ changes: 0 }, {
              others: [{ args: { id: "7" }, value: user("7", "Uma") }]
            }),
          /others.*given args/
        )
        // Queries that aren't named keep their results.
        const kept = yield* Scene.make(Team, { id: "1" })
        kept.given({ changes: 0 }, { user: user("1", "Ann", "2") })
          .given({ changes: 5 }, { friend: user("2", "Bea") })
        assert.strictEqual(text(kept), "Ann Bea ?+? ? 5")
        kept.keepPending("others")
          .keepPending("list")
      }))

    it.effect("given replaces loaded results in any key order, against the new results, not the ones held before", () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(Team, { id: "1" })
        s.given({ changes: 0 }, { user: user("1", "Ann", "2"), friend: user("2", "Bea") })
        assert.strictEqual(text(s), "Ann Bea ?+? ? 0")
        // The friend is named first, while the held user still points at "2".
        s.given({ changes: 0 }, { friend: user("3", "Cy"), user: user("1", "Ann", "3") })
        assert.strictEqual(text(s), "Ann Cy ?+? ? 0")
        s.keepPending("others")
          .keepPending("list")
      }))

    it.effect("given prunes a keyed query with no onChange message, and a later step's prune still sends it", () =>
      Effect.gen(function*() {
        const Message = UiSchema.TaggedEnum({ FriendsChanged: {} })
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
              onChange: () => Message.FriendsChanged()
            }
          }
        }).make({
          init: () => ({ changes: 0 }),
          update: (model) => ({ changes: model.changes + 1 }),
          view: (model, h) =>
            h.p(`${h.queries.friends.filter((entry) => AsyncResult.isSuccess(entry.result)).length} ${model.changes}`)
        })
        const s = yield* Scene.make(Pals, { id: "1" })
        s.given({ changes: 0 }, {
          user: user("1", "Ann", "2"),
          friends: [{ args: { id: "2" }, value: user("2", "Bea") }]
        })
        assert.strictEqual(text(s), "1 0")
        // The friend id moves to "3": the held "2" is pruned, silently.
        s.given({ changes: 0 }, { user: user("1", "Ann", "3") })
        assert.strictEqual(text(s), "0 0")
        s.loadedMany("friends", [{ args: { id: "3" }, value: user("3", "Cy") }])
        assert.strictEqual(text(s), "1 1")
        // An ordinary step's prune sends onChange.
        s.loaded("user", user("1", "Ann", "4"))
        assert.strictEqual(text(s), "0 2")
        s.keepPending("friends")
      }))

    it.effect("given keeps a keyed result its query returns again once the given results settle", () =>
      Effect.gen(function*() {
        const Message = UiSchema.TaggedEnum({ FriendsChanged: {} })
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
              onChange: () => Message.FriendsChanged()
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
        const s = yield* Scene.make(Circle, {})
        s.given({ id: "1", changes: 0 }, {
          user: user("1", "Ann", "shared"),
          friends: [{ args: { id: "shared" }, value: user("shared", "Sam") }]
        })
        assert.strictEqual(text(s), "Sam 0")
        // The new user points at the same friend: the held result stays.
        s.given({ id: "2", changes: 0 }, { user: user("2", "Bob", "shared") })
        assert.strictEqual(text(s), "Sam 0")
        // A friend the new user doesn't point at is still dropped, silently.
        s.given({ id: "3", changes: 0 }, { user: user("3", "Cy", "other") })
        assert.strictEqual(text(s), "? 0")
        s.keepPending("friends")
      }))

    it.effect("given with no loaded results works on a component without queries", () =>
      Effect.gen(function*() {
        const s = yield* Story.make(Counter, { initial: 0 })
        s.given({ count: 3 }, {})
        assert.strictEqual(s.model.count, 3)
      }))
  })

  describe("the acknowledgement rule", () => {
    describe("failure messages redact what the log redacts", () => {
      // Synthetic secrets. `at` fails to encode when it isn't finite, so the encoding falls back.
      const Secret = Schema.RedactedFromValue(Schema.String)
      const Receiver = Component.define({
        name: "SecretReceiver",
        model: Schema.Null,
        message: UiSchema.TaggedEnum({ Take: { token: Secret, at: Schema.Finite } }),
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
          it.effect(`${kind}, ${Number.isNaN(at) ? "falling back when it fails to encode" : "encoded"}`, () =>
            Effect.gen(function*() {
              const message = { kind, at }
              const s = Story.start(App, {}).send(message)
              const messages = [
                yield* defect(Effect.gen(function*() {
                  const story = yield* Story.make(App, {})
                  story.send(message)
                })),
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
            }))
        }
      }
    })

    const edit = NoteMessage.Edit({ text: "x" })
    const saved = NoteEvents.Saved({ text: "" })

    it.effect("a message step waits for a plain Command, and switch, queue and stream Commands don't block it", () =>
      Effect.gen(function*() {
        const s = Story.start(Note, {})
          .send(NoteMessage.Find({ text: "a" }))
          .send(NoteMessage.Sync())
          .send(NoteMessage.Follow())
          .send(NoteMessage.Save())
        assert.throws(
          () => s.send(edit),
          /^Story\.send: earlier work isn't settled or acknowledged:\n {2}- notes\/SaveNote\(\{"text":""\}\) \[running\] is pending/
        )
        s.keepPending(SaveNoteCommand).send(edit)
        // Exempt or kept, the end of make checks it.
        const message = yield* defect(Effect.gen(function*() {
          const story = yield* Story.make(Note, {})
          story.send(NoteMessage.Find({ text: "a" }))
        }))
        assert.match(
          message,
          /^Story\.make: the test ends with work not settled or acknowledged:\n {2}- notes\/FindNotes/
        )
      }))

    it.effect("an enabled query with no result blocks a message step and the end, unless kept", () =>
      Effect.gen(function*() {
        assert.throws(() => Story.start(Note, { author: "1" }).send(edit), /the query "author" has no result/)
        const message = yield* defect(Story.make(Note, { author: "1" }))
        assert.match(message, /^Story\.make: .*\n {2}- the query "author" has no result/)
        const kept = yield* Story.make(Note, { author: "1" })
        kept.keepPending("author").send(edit)
        const loaded = yield* Story.make(Note, { author: "1" })
        loaded.loaded("author", { id: "1", name: "Ann", email: "", likes: 0 }).send(edit)
      }))

    it.effect("emitted and sent take the values they acknowledge, and an acting step waits for them", () =>
      Effect.gen(function*() {
        const s = Story.start(Note, {}).send(NoteMessage.Save())
          .resolve(SaveNoteCommand, NoteMessage.Saved())
        assert.throws(() => s.send(edit), /was emitted/)
        assert.throws(() => s.emitted(NoteEvents.Saved({ text: "other" })), /^Story\.emitted: /)
        s.emitted(saved).send(NoteMessage.Clear())
        assert.throws(() => s.props({}), /was sent/)
        s.sent(BadgeRef, { _tag: "Clear" })
        assert.lengthOf(s.current.sent, 0)
        const message = yield* defect(Effect.gen(function*() {
          const story = yield* Story.make(Note, {})
          story.send(NoteMessage.Clear())
        }))
        assert.match(message, /^Story\.make: .*\n {2}- .*Clear.* to Badge.* was sent/)
      }))

    it.effect("given replaces what init produced, and throws after an acting step rather than discard work", () =>
      Effect.gen(function*() {
        const s = Story.start(Note, {}).send(NoteMessage.Save())
        assert.throws(() => s.given((model) => model), /^Story\.given: /)
        const kept = yield* Story.make(Note, {})
        kept.given((model) => ({ ...model, text: "kept" }))
        assert.strictEqual(kept.model.text, "kept")
        // A query a message enabled is work too: given can't disable it before it has a result.
        const author = NoteMessage.Author({ id: "1" })
        const enabled = Story.start(Note, {}).send(author)
        assert.throws(
          () => enabled.given((model) => ({ ...model, author: undefined })),
          /^Story\.given: given would discard work not settled or acknowledged:\n {2}- the query "author" has no result, and given would drop it/
        )
        // Giving it a result, or leaving it waiting, discards nothing.
        const given = yield* Story.make(Note, {})
        given.send(author).given((model) => model, { author: { id: "1", name: "Ann", email: "", likes: 0 } })
        const waiting = yield* Story.make(Note, {})
        waiting.send(author).given((model) => model).keepPending("author")
      }))
  })
})
