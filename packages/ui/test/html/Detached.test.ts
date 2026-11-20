// @vitest-environment happy-dom
import { Child, Component, Feature, MessageLog, Mount, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { HtmlLocator, ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Schema } from "effect"

const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))
const makeContainer = (html = "") =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const element = document.body.appendChild(document.createElement("div"))
      element.innerHTML = html
      return element
    }),
    (element) => Effect.sync(() => element.remove())
  )

// The first init of each runs on the server: a Model the client built with its own init would say so.
let inits = { avatar: 0, profile: 0 }
const side = (count: number) => count === 0 ? "server" : "client"

const Avatar = Component.define({
  name: "Avatar",
  lifetime: "view",
  model: Schema.String,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => "avatar from the " + side(inits.avatar++),
  update: (model) => model,
  view: (text, h) => h.i(text)
})

const Profile = Component.define({
  name: "Profile",
  lifetime: "model",
  model: Schema.String,
  message: Schema.Never,
  elements: Html
})
  .make({
    init: () => "draft from the " + side(inits.profile++),
    update: (model) => model,
    view: (draft, h) => h.form(h.p(draft), Avatar(h, { key: "a" }))
  })

const Settings = Component.define({
  name: "Settings",
  lifetime: "view",
  model: Schema.String,
  message: UiSchema.TaggedEnum({ Show: { tab: Schema.String } }),
  elements: Html
}).make({
  children: { profile: Profile },
  init: () => "billing",
  update: (_, { tab }) => tab,
  view: (tab, h) => h.main(h.h1(tab), tab === "profile" ? h.children.profile() : null)
})

describe("model children on the server", () => {
  it.effect("writes no nodes for a model child the view doesn't place, and the client builds them from the server's state", () =>
    Effect.gen(function*() {
      inits = { avatar: 0, profile: 0 }
      // Fails if the client rebuilt nodes the server wrote, or didn't adopt a Model the server sent.
      const result = yield* ssr(Settings, {})
      assert.notInclude(result.html, "Profile")
      assert.notInclude(result.html, "draft from")
      assert.include(result.adopted, "/Settings/Profile[profile]")
      assert.include(result.adopted, "/Settings/Profile[profile]/Avatar[a]")

      result.root.send({ _tag: "Show", tab: "profile" })
      yield* TestHost.settle
      assert.strictEqual(result.container.querySelector("p")!.textContent, "draft from the server")
      assert.strictEqual(result.container.querySelector("i")!.textContent, "avatar from the server")
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("keeps a moved model child whose root tag changes on BrowserHost", () =>
    Effect.gen(function*() {
      const RowMsg = UiSchema.TaggedEnum({ Inc: {} })
      const Row = Component.define({
        name: "Row",
        lifetime: "model",
        props: Schema.Struct({ asParagraph: Schema.Boolean }),
        model: Schema.Number,
        message: RowMsg,
        elements: Html
      }).make({
        init: () => 0,
        update: (count) => count + 1,
        view: (count, h) =>
          h.props.asParagraph
            ? h.p(`row:${count}`)
            : h.button.onClick(RowMsg.Inc()).children(`row:${count}`)
      })
      const BoardMsg = UiSchema.TaggedEnum({ Flip: {} })
      const Board = Component.define({
        name: "Board",
        lifetime: "view",
        model: Schema.Boolean,
        message: BoardMsg,
        elements: Html
      }).make({
        children: { row: Child.one(Row, { props: (right) => ({ asParagraph: right }) }) },
        init: () => false,
        update: (right) => !right,
        view: (right, h) =>
          h.div(
            h.aside(right ? null : h.children.row()),
            h.article(right ? h.children.row() : null)
          )
      })
      const log = MessageLog.makeMemory()
      const app = yield* makeContainer()
      const root = yield* BrowserHost.mountEffect(Board, {}, app).pipe(
        Effect.provideService(MessageLog.MessageLog, log)
      )
      ;(app.querySelector("aside button") as HTMLButtonElement).click()
      yield* tick
      assert.strictEqual(app.querySelector("aside button")!.textContent, "row:1")

      root.send(BoardMsg.Flip())
      yield* tick
      assert.strictEqual(app.querySelector("aside")!.textContent, "")
      assert.strictEqual(app.querySelector("article p")?.textContent, "row:1")
      assert.deepStrictEqual(log.entries().filter((entry) => entry._tag === "Failed"), [])
    }).pipe(Effect.scoped))

  it.live("hydrates a listed field inside a slotted receiver whose Layer waits, preserving edits made while waiting", () =>
    Effect.gen(function*() {
      class Slow extends Context.Service<Slow, string>()("test/SlowReceiver") {}
      const FieldMsg = UiSchema.TaggedEnum({ Typed: { value: Schema.String } })
      const Field = Component.define({
        name: "Field",
        lifetime: "model",
        model: Schema.String,
        message: FieldMsg,
        elements: Html
      }).make({
        init: () => "server",
        update: (_, { value }) => value,
        view: (value, h) =>
          h.div(
            h.input.value(value).onInput(({ value }) => FieldMsg.Typed({ value })),
            h.output(value)
          )
      })
      const makePage = (layer: Layer.Layer<Slow>) => {
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(layer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          children: { field: Field },
          init: () => null,
          update: (model) => model,
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.field() } })
        })
      }
      const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.succeed(Slow, "ready")), {})
      const app = yield* makeContainer(rendered.html)
      const serverInput = app.querySelector("input") as HTMLInputElement
      const release = yield* Deferred.make<void>()
      const root = yield* BrowserHost.mountEffect(
        makePage(Layer.effect(Slow, Effect.as(Deferred.await(release), "ready"))),
        {},
        app,
        { state: rendered.state }
      )
      HtmlLocator.type(serverInput, "typed")
      yield* Deferred.succeed(release, undefined)
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("input"), serverInput)
      assert.strictEqual(serverInput.value, "typed")
      assert.strictEqual(app.querySelector("output")?.textContent, "typed")
      assert.notInclude(app.innerHTML, "<!--")
      HtmlLocator.type(serverInput, "more")
      yield* tick
      assert.strictEqual(app.querySelector("output")?.textContent, "more")
    }).pipe(Effect.scoped))

  it.live("keeps a listed field moved out of a waiting receiver into a sibling after adoption", () =>
    Effect.gen(function*() {
      class Slow extends Context.Service<Slow, string>()("test/SlowMove") {}
      const FieldMsg = UiSchema.TaggedEnum({ Typed: { value: Schema.String } })
      const Field = Component.define({
        name: "Field",
        lifetime: "model",
        model: Schema.String,
        message: FieldMsg,
        elements: Html
      }).make({
        init: () => "server",
        update: (_, { value }) => value,
        view: (value, h) =>
          h.div(
            h.input.value(value).onInput(({ value }) => FieldMsg.Typed({ value })),
            h.output(value)
          )
      })
      const PageMsg = UiSchema.TaggedEnum({ Move: {} })
      const makePage = (layer: Layer.Layer<Slow>) => {
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(layer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Boolean,
          message: PageMsg,
          elements: Html
        }).make({
          children: { field: Field },
          init: () => false,
          update: () => true,
          view: (moved, h) =>
            h.main(
              Card(h, { key: "c", slots: { body: moved ? null : h.children.field() } }),
              h.aside(moved ? h.children.field() : null)
            )
        })
      }
      const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.succeed(Slow, "ready")), {})
      const app = yield* makeContainer(rendered.html)
      const release = yield* Deferred.make<void>()
      const root = yield* BrowserHost.mountEffect(
        makePage(Layer.effect(Slow, Effect.as(Deferred.await(release), "ready"))),
        {},
        app,
        { state: rendered.state }
      )
      root.send(PageMsg.Move())
      yield* tick
      const liveInput = app.querySelector("aside input") as HTMLInputElement
      HtmlLocator.type(liveInput, "edited")
      yield* tick
      assert.strictEqual(app.querySelector("aside output")?.textContent, "edited")

      yield* Deferred.succeed(release, undefined)
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("section")?.textContent, "")
      assert.strictEqual(app.querySelector("aside input"), liveInput)
      assert.strictEqual(liveInput.value, "edited")
      assert.strictEqual(app.querySelector("aside output")?.textContent, "edited")
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live("delivers sends to a listed child while its slotted receiver waits to adopt", () =>
    Effect.gen(function*() {
      class Slow extends Context.Service<Slow, string>()("test/SlowSend") {}
      const CounterMsg = UiSchema.TaggedEnum({ Inc: {} })
      const makeCounter = (initial: number) =>
        Component.define({
          name: "Counter",
          lifetime: "model",
          model: Schema.Number,
          message: CounterMsg,
          receives: ["Inc"],
          elements: Html
        }).make({
          init: () => initial,
          update: (n) => n + 1,
          view: (n, h) => h.p(String(n))
        })
      const PageMsg = UiSchema.TaggedEnum({ Inc: {} })
      const makePage = (layer: Layer.Layer<Slow>, initial: number) => {
        const Counter = makeCounter(initial)
        const CounterRef = Counter.ref("counter")
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(layer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Null,
          message: PageMsg,
          elements: Html
        }).make({
          children: { counter: Counter },
          init: () => null,
          update: (_, __, $) => $.send(CounterRef, CounterMsg.Inc()),
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.counter() } })
        })
      }
      const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.succeed(Slow, "ready"), 41), {})
      const app = yield* makeContainer(rendered.html)
      const release = yield* Deferred.make<void>()
      const log = MessageLog.makeMemory()
      const root = yield* BrowserHost.mountEffect(
        makePage(Layer.effect(Slow, Effect.as(Deferred.await(release), "ready")), 0),
        {},
        app,
        { state: rendered.state }
      ).pipe(Effect.provideService(MessageLog.MessageLog, log))
      root.send(PageMsg.Inc())
      yield* tick
      yield* Deferred.succeed(release, undefined)
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("section p")?.textContent, "42")
      assert.isTrue(log.entries().some((entry) => entry._tag === "Update" && entry.path === "/Page/Counter[counter]"))
      assert.deepStrictEqual(
        log.entries().filter((entry) => entry._tag === "SendDropped"),
        []
      )
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live(
    "preserves a listed child's shipped model when its waiting receiver is removed or it moves to a new receiver",
    () =>
      Effect.gen(function*() {
        class Slow extends Context.Service<Slow, string>()("test/SlowRelocate") {}
        const makeBox = (initial: string) =>
          Component.define({
            name: "Box",
            lifetime: "model",
            model: Schema.String,
            message: Schema.Never,
            elements: Html
          }).make({
            init: () => initial,
            update: (model) => model,
            view: (value, h) => h.p(value)
          })
        const Mode = Schema.Literals(["waiting", "held", "shown", "sibling"])
        const makePage = (layer: Layer.Layer<Slow>, initial: string) => {
          const Box = makeBox(initial)
          const WaitingCard = Component.define({
            name: "WaitingCard",
            lifetime: "view",
            model: Schema.Null,
            message: Schema.Never,
            elements: Html,
            slots: ["body"]
          }).make({
            init: () => null,
            update: (model) => model,
            view: (_, h) => h.section(h.slots.body)
          }).pipe(Component.provide(layer))
          const SiblingCard = Component.define({
            name: "SiblingCard",
            lifetime: "view",
            model: Schema.Null,
            message: Schema.Never,
            elements: Html,
            slots: ["body"]
          }).make({
            init: () => null,
            update: (model) => model,
            view: (_, h) => h.article(h.slots.body)
          })
          return Component.define({
            name: "Page",
            lifetime: "view",
            model: Mode,
            message: Mode,
            elements: Html
          }).make({
            children: { box: Box },
            init: () => "waiting" as const,
            update: (_, next) => next,
            view: (mode, h) =>
              h.main(
                mode === "waiting" || mode === "sibling"
                  ? WaitingCard(h, { key: "w", slots: { body: mode === "waiting" ? h.children.box() : null } })
                  : null,
                mode === "sibling" ? SiblingCard(h, { key: "s", slots: { body: h.children.box() } }) : null,
                mode === "shown" ? h.aside(h.children.box()) : null
              )
          })
        }

        // Route 1: remove the last waiting receiver, keep the child listed unplaced, then show after adoption.
        const rendered1 = yield* HtmlServer.renderToHtml(makePage(Layer.succeed(Slow, "ready"), "server"), {})
        const app1 = yield* makeContainer(rendered1.html)
        const release1 = yield* Deferred.make<void>()
        const root1 = yield* BrowserHost.mountEffect(
          makePage(Layer.effect(Slow, Effect.as(Deferred.await(release1), "ready")), "client"),
          {},
          app1,
          { state: rendered1.state }
        )
        root1.send("held")
        yield* root1.adopted
        yield* tick
        root1.send("shown")
        yield* tick
        assert.strictEqual(app1.querySelector("aside p")?.textContent, "server")

        // Route 2: move the child into a newly mounted sibling receiver's slot while the original still waits.
        const rendered2 = yield* HtmlServer.renderToHtml(makePage(Layer.succeed(Slow, "ready"), "server"), {})
        const app2 = yield* makeContainer(rendered2.html)
        const release2 = yield* Deferred.make<void>()
        const root2 = yield* BrowserHost.mountEffect(
          makePage(Layer.effect(Slow, Effect.as(Deferred.await(release2), "ready")), "client"),
          {},
          app2,
          { state: rendered2.state }
        )
        root2.send("sibling")
        yield* tick
        assert.strictEqual(app2.querySelector("article p")?.textContent, "server")
        yield* Deferred.succeed(release2, undefined)
        yield* root2.adopted
        yield* tick
        assert.strictEqual(app2.querySelector("section")?.textContent, "")
        assert.strictEqual(app2.querySelector("article p")?.textContent, "server")
        assert.notInclude(app2.innerHTML, "<!--")
      }).pipe(Effect.scoped)
  )

  it.live("delivers a pending edit to the server-rendered keyed field when keys reverse while waiting", () =>
    Effect.gen(function*() {
      class Slow extends Context.Service<Slow, string>()("test/SlowKeyedReorder") {}
      const Key = Schema.Literals(["A", "B"])
      const FormMsg = UiSchema.TaggedEnum({ Typed: { key: Key, value: Schema.String } })
      const Form = Component.define({
        name: "Form",
        lifetime: "model",
        props: Schema.Struct({ order: Schema.Array(Key) }),
        model: Schema.Struct({ A: Schema.String, B: Schema.String }),
        message: FormMsg,
        elements: Html
      }).make({
        init: () => ({ A: "alpha", B: "bravo" }),
        update: (model, { key, value }) => ({ ...model, [key]: value }),
        view: (model, h) =>
          h.form(
            ...h.props.order.map((key) =>
              h.input.key(key).attr("data-key", key).value(model[key]).onInput(({ value }) =>
                FormMsg.Typed({ key, value })
              )
            ),
            h.output(`A=${model.A}, B=${model.B}`)
          )
      })
      const PageMsg = UiSchema.TaggedEnum({ Reverse: {} })
      const makePage = (layer: Layer.Layer<Slow>) => {
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(layer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Array(Key),
          message: PageMsg,
          elements: Html
        }).make({
          children: { form: Child.one(Form, { props: (order) => ({ order }) }) },
          init: () => ["A", "B"] as const,
          update: (order) => [...order].reverse(),
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.form() } })
        })
      }
      const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.succeed(Slow, "ready")), {})
      const app = yield* makeContainer(rendered.html)
      const release = yield* Deferred.make<void>()
      const root = yield* BrowserHost.mountEffect(
        makePage(Layer.effect(Slow, Effect.as(Deferred.await(release), "ready"))),
        {},
        app,
        { state: rendered.state }
      )
      const serverA = app.querySelector("input[data-key='A']") as HTMLInputElement
      HtmlLocator.type(serverA, "typed for A")
      root.send(PageMsg.Reverse())
      yield* tick
      yield* Deferred.succeed(release, undefined)
      yield* root.adopted
      yield* tick
      const inputs = Array.from(app.querySelectorAll("input")) as Array<HTMLInputElement>
      assert.deepStrictEqual(inputs.map((input) => input.getAttribute("data-key")), ["B", "A"])
      assert.strictEqual(inputs[1], serverA)
      assert.strictEqual(inputs[0]!.value, "bravo")
      assert.strictEqual(inputs[1]!.value, "typed for A")
      assert.strictEqual(app.querySelector("output")?.textContent, "A=typed for A, B=bravo")
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live("reconciles removed attributes when a held child updates while its receiver waits", () =>
    Effect.gen(function*() {
      class Slow extends Context.Service<Slow, string>()("test/SlowDisabled") {}
      const CounterMsg = UiSchema.TaggedEnum({ Inc: {} })
      const Counter = Component.define({
        name: "Counter",
        lifetime: "model",
        model: Schema.Number,
        message: CounterMsg,
        receives: ["Inc"],
        elements: Html
      }).make({
        init: () => 41,
        update: (n) => n + 1,
        view: (n, h) => h.button.disabled(n < 42).onClick(CounterMsg.Inc()).children(String(n))
      })
      const CounterRef = Counter.ref("counter")
      const PageMsg = UiSchema.TaggedEnum({ Inc: {} })
      const makePage = (layer: Layer.Layer<Slow>) => {
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(layer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Null,
          message: PageMsg,
          elements: Html
        }).make({
          children: { counter: Counter },
          init: () => null,
          update: (_, __, $) => $.send(CounterRef, CounterMsg.Inc()),
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.counter() } })
        })
      }
      const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.succeed(Slow, "ready")), {})
      const app = yield* makeContainer(rendered.html)
      const release = yield* Deferred.make<void>()
      const root = yield* BrowserHost.mountEffect(
        makePage(Layer.effect(Slow, Effect.as(Deferred.await(release), "ready"))),
        {},
        app,
        { state: rendered.state }
      )
      root.send(PageMsg.Inc())
      yield* tick
      yield* Deferred.succeed(release, undefined)
      yield* root.adopted
      yield* tick
      const button = app.querySelector("section button") as HTMLButtonElement
      assert.strictEqual(button.textContent, "42")
      assert.isFalse(button.hasAttribute("disabled"))
      assert.isFalse(button.disabled)
      button.click()
      yield* tick
      assert.strictEqual(button.textContent, "43")
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live("waits for a listed child's own pending Layer before adopting its server feature field", () =>
    Effect.gen(function*() {
      class CardSlow extends Context.Service<CardSlow, string>()("test/CardSlow") {}
      class ChildSlow extends Context.Service<ChildSlow, string>()("test/ChildSlow") {}
      class FieldFeature extends Feature.Service<FieldFeature>()("test/WaitingFeatureField", {
        props: Schema.Struct({})
      }) {}
      const FieldMsg = UiSchema.TaggedEnum({ Typed: { value: Schema.String } })
      const FieldImpl = Component.define({
        name: "FieldImpl",
        lifetime: "view",
        model: Schema.String,
        message: FieldMsg,
        elements: Html
      }).make({
        init: () => "server",
        update: (_, { value }) => value,
        view: (value, h) =>
          h.div(
            h.input.value(value).onInput(({ value }) => FieldMsg.Typed({ value })),
            h.output(value)
          )
      })
      const makePage = (cardLayer: Layer.Layer<CardSlow>, childLayer: Layer.Layer<ChildSlow>) => {
        const featureLayer = FieldFeature.toLayer(FieldImpl).pipe(Layer.provide(childLayer))
        const Editor = Component.define({
          name: "Editor",
          lifetime: "model",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            FieldFeature.render(h, {
              key: "f",
              props: {},
              fallback: () => h.p("loading")
            })
        }).pipe(Component.provide(featureLayer))
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(cardLayer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          children: { editor: Editor },
          init: () => null,
          update: (model) => model,
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.editor() } })
        })
      }
      const rendered = yield* HtmlServer.renderToHtml(
        makePage(Layer.succeed(CardSlow, "ready"), Layer.succeed(ChildSlow, "ready")),
        {}
      )
      const app = yield* makeContainer(rendered.html)
      const releaseCard = yield* Deferred.make<void>()
      const releaseChild = yield* Deferred.make<void>()
      const root = yield* BrowserHost.mountEffect(
        makePage(
          Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard), "ready")),
          Layer.effect(ChildSlow, Effect.as(Deferred.await(releaseChild), "ready"))
        ),
        {},
        app,
        { state: rendered.state }
      )
      let adopted = false
      yield* Effect.forkScoped(root.adopted.pipe(Effect.tap(() => Effect.sync(() => void (adopted = true)))))
      const serverInput = app.querySelector("section input") as HTMLInputElement
      HtmlLocator.type(serverInput, "typed")

      // Release only the receiver's Layer: adoption must still wait for the child's Layer.
      yield* Deferred.succeed(releaseCard, undefined)
      yield* tick
      assert.isFalse(adopted)
      assert.strictEqual(app.querySelector("section input"), serverInput)
      assert.strictEqual(serverInput.value, "typed")
      assert.isNull(app.querySelector("section p"))

      // Release the child's Layer: the server input is adopted with the typed value intact.
      yield* Deferred.succeed(releaseChild, undefined)
      yield* root.adopted
      yield* tick
      assert.isTrue(adopted)
      assert.strictEqual(app.querySelector("section input"), serverInput)
      assert.strictEqual(serverInput.value, "typed")
      assert.strictEqual(app.querySelector("section output")?.textContent, "typed")
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live("keeps a held child live for sends, moves, and Layer onFailure while its DOM range waits", () =>
    Effect.gen(function*() {
      class CardSlow extends Context.Service<CardSlow, string>()("test/CardSlowLive") {}
      class ChildSlow extends Context.Service<ChildSlow, string>()("test/ChildSlowLive") {}
      const CounterMsg = UiSchema.TaggedEnum({ Inc: {}, Failed: {} })
      const PageMsg = UiSchema.TaggedEnum({
        Inc: {},
        Place: { place: Schema.Literals(["card", "held", "aside"]) }
      })
      const makePage = (
        cardLayer: Layer.Layer<CardSlow>,
        childLayer: Layer.Layer<ChildSlow, string>,
        initial: number
      ) => {
        const Counter = Component.provide(
          Component.define({
            name: "Counter",
            lifetime: "model",
            model: Schema.Struct({ count: Schema.Number, failed: Schema.Boolean }),
            message: CounterMsg,
            receives: ["Inc"],
            elements: Html
          }).make({
            init: () => ({ count: initial, failed: false }),
            update: (model, message) =>
              CounterMsg.match(message, {
                Inc: () => ({ ...model, count: model.count + 1 }),
                Failed: () => ({ ...model, failed: true })
              }),
            view: (model, h) => h.p(model.failed ? `failed:${model.count}` : String(model.count))
          }),
          childLayer,
          { onFailure: () => CounterMsg.Failed() }
        )
        const CounterRef = Counter.ref("counter")
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(cardLayer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Literals(["card", "held", "aside"]),
          message: PageMsg,
          elements: Html
        }).make({
          children: { counter: Counter },
          init: () => "card" as const,
          update: (place, message, $) =>
            PageMsg.match(message, {
              Inc: () => $.set(place).send(CounterRef, CounterMsg.Inc()),
              Place: ({ place: next }) => next
            }),
          view: (place, h) =>
            h.main(
              Card(h, { key: "c", slots: { body: place === "card" ? h.children.counter() : null } }),
              place === "aside" ? h.aside(h.children.counter()) : null
            )
        })
      }

      const rendered = yield* HtmlServer.renderToHtml(
        makePage(Layer.succeed(CardSlow, "ready"), Layer.succeed(ChildSlow, "ready"), 41),
        {}
      )

      // 1. Sends still land after the receiver resolves while the child's Layer is pending.
      const app1 = yield* makeContainer(rendered.html)
      const releaseCard1 = yield* Deferred.make<void>()
      const releaseChild1 = yield* Deferred.make<void>()
      const log1 = MessageLog.makeMemory()
      const root1 = yield* BrowserHost.mountEffect(
        makePage(
          Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard1), "ready")),
          Layer.effect(ChildSlow, Effect.as(Deferred.await(releaseChild1), "ready")),
          0
        ),
        {},
        app1,
        { state: rendered.state }
      ).pipe(Effect.provideService(MessageLog.MessageLog, log1))
      root1.send(PageMsg.Inc())
      yield* tick
      yield* Deferred.succeed(releaseCard1, undefined)
      yield* tick
      root1.send(PageMsg.Inc())
      yield* tick
      yield* Deferred.succeed(releaseChild1, undefined)
      yield* root1.adopted
      yield* tick
      assert.strictEqual(app1.querySelector("section p")?.textContent, "43")
      assert.deepStrictEqual(log1.entries().filter((entry) => entry._tag === "SendDropped"), [])

      // 2. Hiding and moving to an aside while the DOM range waits preserves the live instance and increments.
      const app2 = yield* makeContainer(rendered.html)
      const releaseCard2 = yield* Deferred.make<void>()
      const releaseChild2 = yield* Deferred.make<void>()
      const root2 = yield* BrowserHost.mountEffect(
        makePage(
          Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard2), "ready")),
          Layer.effect(ChildSlow, Effect.as(Deferred.await(releaseChild2), "ready")),
          0
        ),
        {},
        app2,
        { state: rendered.state }
      )
      root2.send(PageMsg.Inc())
      yield* tick
      yield* Deferred.succeed(releaseCard2, undefined)
      yield* tick
      root2.send(PageMsg.Place({ place: "held" }))
      yield* tick
      root2.send(PageMsg.Place({ place: "aside" }))
      yield* root2.adopted
      yield* tick
      assert.strictEqual(app2.querySelector("section")?.textContent, "")
      assert.strictEqual(app2.querySelector("aside p")?.textContent, "42")

      // 3. Inner Layer failure after the receiver resolves still delivers onFailure to the live model.
      const app3 = yield* makeContainer(rendered.html)
      const releaseCard3 = yield* Deferred.make<void>()
      const releaseChild3 = yield* Deferred.make<void, string>()
      const root3 = yield* BrowserHost.mountEffect(
        makePage(
          Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard3), "ready")),
          Layer.effect(ChildSlow, Effect.as(Deferred.await(releaseChild3), "ready")),
          0
        ),
        {},
        app3,
        { state: rendered.state }
      )
      yield* Deferred.succeed(releaseCard3, undefined)
      yield* tick
      yield* Deferred.fail(releaseChild3, "boom")
      yield* root3.adopted
      yield* tick
      assert.strictEqual(app3.querySelector("section p")?.textContent, "failed:41")
    }).pipe(Effect.scoped))

  it.live("preserves serverView on detached moves and prevents recreated children from claiming old edits", () =>
    Effect.gen(function*() {
      class Slow extends Context.Service<Slow, string>()("test/SlowNestedForm") {}
      const Key = Schema.Literals(["A", "B"])
      const FormMsg = UiSchema.TaggedEnum({ Typed: { key: Key, value: Schema.String } })
      const Form = Component.define({
        name: "Form",
        lifetime: "view",
        props: Schema.Struct({ order: Schema.Array(Key) }),
        model: Schema.Struct({ A: Schema.String, B: Schema.String }),
        message: FormMsg,
        elements: Html
      }).make({
        init: () => ({ A: "alpha", B: "bravo" }),
        update: (model, { key, value }) => ({ ...model, [key]: value }),
        view: (model, h) =>
          h.form(
            ...h.props.order.map((key) =>
              h.input.key(key).attr("data-key", key).value(model[key]).onInput(({ value }) =>
                FormMsg.Typed({ key, value })
              )
            ),
            h.output(`A=${model.A}, B=${model.B}`)
          )
      })
      const BoxState = Schema.Struct({
        slot: Schema.Literals(["aside", "article", "none"]),
        order: Schema.Array(Key)
      })
      const Box = Component.define({
        name: "Box",
        lifetime: "model",
        props: BoxState,
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) =>
          h.div(
            h.props.slot === "aside" ? h.aside(Form(h, { key: "f", props: { order: h.props.order } })) : null,
            h.props.slot === "article" ? h.article(Form(h, { key: "f", props: { order: h.props.order } })) : null
          )
      })
      const makePage = (layer: Layer.Layer<Slow>) => {
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(layer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: BoxState,
          message: BoxState,
          elements: Html
        }).make({
          children: { box: Child.one(Box, { props: (state) => state }) },
          init: () => ({ slot: "aside" as const, order: ["A", "B"] as const }),
          update: (_, next) => next,
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.box() } })
        })
      }

      const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.succeed(Slow, "ready")), {})

      // 1. Moving the same Form from aside to article inside detached Box while reversing keys keeps the edit on A.
      const app1 = yield* makeContainer(rendered.html)
      const release1 = yield* Deferred.make<void>()
      const root1 = yield* BrowserHost.mountEffect(
        makePage(Layer.effect(Slow, Effect.as(Deferred.await(release1), "ready"))),
        {},
        app1,
        { state: rendered.state }
      )
      const serverA1 = app1.querySelector("input[data-key='A']") as HTMLInputElement
      HtmlLocator.type(serverA1, "typed for A")
      root1.send({ slot: "article", order: ["B", "A"] })
      yield* tick
      yield* Deferred.succeed(release1, undefined)
      yield* root1.adopted
      yield* tick
      const inputs1 = Array.from(app1.querySelectorAll("article input")) as Array<HTMLInputElement>
      assert.deepStrictEqual(inputs1.map((input) => input.getAttribute("data-key")), ["B", "A"])
      assert.strictEqual(inputs1[1], serverA1)
      assert.strictEqual(inputs1[0]!.value, "bravo")
      assert.strictEqual(inputs1[1]!.value, "typed for A")
      assert.strictEqual(app1.querySelector("article output")?.textContent, "A=typed for A, B=bravo")

      // 2. Removing Form, flushing removal, and recreating it at the same key in reverse order does not claim A's old edit.
      const app2 = yield* makeContainer(rendered.html)
      const release2 = yield* Deferred.make<void>()
      const root2 = yield* BrowserHost.mountEffect(
        makePage(Layer.effect(Slow, Effect.as(Deferred.await(release2), "ready"))),
        {},
        app2,
        { state: rendered.state }
      )
      const serverA2 = app2.querySelector("input[data-key='A']") as HTMLInputElement
      HtmlLocator.type(serverA2, "typed for A")
      root2.send({ slot: "none", order: ["A", "B"] })
      yield* tick
      root2.send({ slot: "aside", order: ["B", "A"] })
      yield* tick
      yield* Deferred.succeed(release2, undefined)
      yield* root2.adopted
      yield* tick
      const inputs2 = Array.from(app2.querySelectorAll("aside input")) as Array<HTMLInputElement>
      assert.deepStrictEqual(inputs2.map((input) => input.getAttribute("data-key")), ["B", "A"])
      assert.strictEqual(inputs2[0]!.value, "bravo")
      assert.strictEqual(inputs2[1]!.value, "alpha")
      assert.strictEqual(app2.querySelector("aside output")?.textContent, "A=alpha, B=bravo")
      assert.notInclude(app2.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live("does not restart a removed feature's Layer when adopting a held child's serverView", () =>
    Effect.gen(function*() {
      class CardSlow extends Context.Service<CardSlow, string>()("test/CardSlowRemovedFeature") {}
      class Resource extends Context.Service<Resource, string>()("test/RemovedFeatureResource") {}
      class PanelFeature extends Feature.Service<PanelFeature>()("test/RemovedFeaturePanel", {
        props: Schema.Struct({})
      }) {}
      let acquires = 0
      let releases = 0
      const makePage = (cardLayer: Layer.Layer<CardSlow>, track: boolean) => {
        const resourceLayer = Layer.effect(
          Resource,
          Effect.acquireRelease(
            Effect.sync(() => {
              if (track) acquires++
              return "res"
            }),
            () =>
              Effect.sync(() => {
                if (track) releases++
              })
          )
        )
        const PanelImpl = Component.define({
          name: "PanelImpl",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.p("panel")
        }).pipe(Component.provide(resourceLayer))
        const Box = Component.define({
          name: "Box",
          lifetime: "model",
          props: Schema.Struct({ show: Schema.Boolean }),
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.div(
              h.props.show
                ? PanelFeature.render(h, { key: "p", props: {}, fallback: () => h.p("loading") })
                : h.span("removed")
            )
        }).pipe(Component.provide(PanelFeature.toLayer(PanelImpl)))
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(cardLayer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Boolean,
          message: Schema.Boolean,
          elements: Html
        }).make({
          children: { box: Child.one(Box, { props: (show) => ({ show }) }) },
          init: () => true,
          update: (_, show) => show,
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.box() } })
        })
      }

      const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.succeed(CardSlow, "ready"), false), {})
      const app = yield* makeContainer(rendered.html)
      const releaseCard = yield* Deferred.make<void>()
      const root = yield* BrowserHost.mountEffect(
        makePage(Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard), "ready")), true),
        {},
        app,
        { state: rendered.state }
      )
      yield* tick
      assert.strictEqual(acquires, 1)
      assert.strictEqual(releases, 0)

      root.send(false)
      yield* tick
      assert.strictEqual(acquires, 1)
      assert.strictEqual(releases, 1)

      yield* Deferred.succeed(releaseCard, undefined)
      yield* root.adopted
      yield* tick
      assert.strictEqual(acquires, 1)
      assert.strictEqual(releases, 1)
      assert.strictEqual(app.querySelector("section span")?.textContent, "removed")
      assert.isNull(app.querySelector("section p"))
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live("settles adoption when a pending child's keyed Layer reselects to a ready Layer", () =>
    Effect.gen(function*() {
      class CardSlow extends Context.Service<CardSlow, string>()("test/CardSlowKeyedReselect") {}
      class ChildSlow extends Context.Service<ChildSlow, string>()("test/ChildSlowKeyedReselect") {}
      const Mode = Schema.Literals(["slow", "fast"])
      const makePage = (
        cardLayer: Layer.Layer<CardSlow>,
        slowLayer: Layer.Layer<ChildSlow>,
        initial: number
      ) => {
        const Counter = Component.provide(
          Component.define({
            name: "Counter",
            lifetime: "model",
            props: Schema.Struct({ mode: Mode }),
            model: Schema.Number,
            message: Schema.Never,
            elements: Html
          }).make({
            init: () => initial,
            update: (n) => n,
            view: (n, h) => h.p(`${n}:${h.props.mode}`)
          }),
          {
            key: (props) => props.mode,
            layer: (mode) => mode === "fast" ? Layer.succeed(ChildSlow, "fast") : slowLayer
          }
        )
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(cardLayer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Mode,
          message: Mode,
          elements: Html
        }).make({
          children: { counter: Child.one(Counter, { props: (mode) => ({ mode }) }) },
          init: () => "slow" as const,
          update: (_, next) => next,
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.counter() } })
        })
      }

      const rendered = yield* HtmlServer.renderToHtml(
        makePage(Layer.succeed(CardSlow, "ready"), Layer.succeed(ChildSlow, "slow"), 41),
        {}
      )
      const app = yield* makeContainer(rendered.html)
      const releaseCard = yield* Deferred.make<void>()
      const releaseSlow = yield* Deferred.make<void>()
      const root = yield* BrowserHost.mountEffect(
        makePage(
          Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard), "ready")),
          Layer.effect(ChildSlow, Effect.as(Deferred.await(releaseSlow), "slow")),
          0
        ),
        {},
        app,
        { state: rendered.state }
      )
      yield* Deferred.succeed(releaseCard, undefined)
      yield* tick
      root.send("fast")
      yield* root.adopted
      yield* tick
      yield* Deferred.succeed(releaseSlow, undefined)
      yield* tick
      assert.strictEqual(app.querySelector("section p")?.textContent, "41:fast")
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live("preserves typed input when moving a nested Form between gates inside a still-pending Box", () =>
    Effect.gen(function*() {
      class CardSlow extends Context.Service<CardSlow, string>()("test/CardSlowBetweenGates") {}
      class BoxSlow extends Context.Service<BoxSlow, string>()("test/BoxSlowBetweenGates") {}
      const FormMsg = UiSchema.TaggedEnum({ Typed: { value: Schema.String } })
      const Form = Component.define({
        name: "Form",
        lifetime: "view",
        model: Schema.String,
        message: FormMsg,
        elements: Html
      }).make({
        init: () => "alpha",
        update: (_, { value }) => value,
        view: (value, h) =>
          h.form(
            h.input.value(value).onInput(({ value }) => FormMsg.Typed({ value })),
            h.output(value)
          )
      })
      const Place = Schema.Literals(["aside", "article"])
      const makePage = (cardLayer: Layer.Layer<CardSlow>, boxLayer: Layer.Layer<BoxSlow>) => {
        const Box = Component.define({
          name: "Box",
          lifetime: "model",
          props: Schema.Struct({ place: Place }),
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.div(
              h.props.place === "aside" ? h.aside(Form(h, { key: "f" })) : null,
              h.props.place === "article" ? h.article(Form(h, { key: "f" })) : null
            )
        }).pipe(Component.provide(boxLayer))
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(cardLayer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Place,
          message: Place,
          elements: Html
        }).make({
          children: { box: Child.one(Box, { props: (place) => ({ place }) }) },
          init: () => "aside" as const,
          update: (_, next) => next,
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.box() } })
        })
      }

      const rendered = yield* HtmlServer.renderToHtml(
        makePage(Layer.succeed(CardSlow, "ready"), Layer.succeed(BoxSlow, "ready")),
        {}
      )
      const app = yield* makeContainer(rendered.html)
      const releaseCard = yield* Deferred.make<void>()
      const releaseBox = yield* Deferred.make<void>()
      const root = yield* BrowserHost.mountEffect(
        makePage(
          Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard), "ready")),
          Layer.effect(BoxSlow, Effect.as(Deferred.await(releaseBox), "ready"))
        ),
        {},
        app,
        { state: rendered.state }
      )
      const serverInput = app.querySelector("section input") as HTMLInputElement
      HtmlLocator.type(serverInput, "my edit")
      yield* Deferred.succeed(releaseCard, undefined)
      yield* tick
      root.send("article")
      yield* tick
      yield* Deferred.succeed(releaseBox, undefined)
      yield* root.adopted
      yield* tick
      const adoptedInput = app.querySelector("article input") as HTMLInputElement
      assert.strictEqual(adoptedInput, serverInput)
      assert.strictEqual(adoptedInput.value, "my edit")
      assert.strictEqual(app.querySelector("article output")?.textContent, "my edit")
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live("forwards sends from a pending child to its own rendered child between gates", () =>
    Effect.gen(function*() {
      class CardSlow extends Context.Service<CardSlow, string>()("test/CardSlowForwardSend") {}
      class BoxSlow extends Context.Service<BoxSlow, string>()("test/BoxSlowForwardSend") {}
      const LeafMsg = UiSchema.TaggedEnum({ Inc: {} })
      const BoxMsg = UiSchema.TaggedEnum({ Forward: {} })
      const PageMsg = UiSchema.TaggedEnum({ Forward: {} })
      const makePage = (cardLayer: Layer.Layer<CardSlow>, boxLayer: Layer.Layer<BoxSlow>, initial: number) => {
        const Leaf = Component.define({
          name: "Leaf",
          lifetime: "model",
          model: Schema.Number,
          message: LeafMsg,
          receives: ["Inc"],
          elements: Html
        }).make({
          init: () => initial,
          update: (n) => n + 1,
          view: (n, h) => h.p(String(n))
        })
        const LeafRef = Leaf.ref("leaf")
        const Box = Component.define({
          name: "Box",
          lifetime: "model",
          model: Schema.Null,
          message: BoxMsg,
          receives: ["Forward"],
          elements: Html
        }).make({
          children: { leaf: Leaf },
          init: () => null,
          update: (_, __, $) => $.send(LeafRef, LeafMsg.Inc()),
          view: (_, h) => h.div(h.children.leaf())
        }).pipe(Component.provide(boxLayer))
        const BoxRef = Box.ref("box")
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(cardLayer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Null,
          message: PageMsg,
          elements: Html
        }).make({
          children: { box: Box },
          init: () => null,
          update: (_, __, $) => $.send(BoxRef, BoxMsg.Forward()),
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.box() } })
        })
      }

      const rendered = yield* HtmlServer.renderToHtml(
        makePage(Layer.succeed(CardSlow, "ready"), Layer.succeed(BoxSlow, "ready"), 41),
        {}
      )
      const app = yield* makeContainer(rendered.html)
      const releaseCard = yield* Deferred.make<void>()
      const releaseBox = yield* Deferred.make<void>()
      const log = MessageLog.makeMemory()
      const root = yield* BrowserHost.mountEffect(
        makePage(
          Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard), "ready")),
          Layer.effect(BoxSlow, Effect.as(Deferred.await(releaseBox), "ready")),
          0
        ),
        {},
        app,
        { state: rendered.state }
      ).pipe(Effect.provideService(MessageLog.MessageLog, log))
      yield* Deferred.succeed(releaseCard, undefined)
      yield* tick
      root.send(PageMsg.Forward())
      yield* tick
      yield* Deferred.succeed(releaseBox, undefined)
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("section p")?.textContent, "42")
      assert.deepStrictEqual(log.entries().filter((entry) => entry._tag === "SendDropped"), [])
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live("does not restart a removed slotted feature or child when adopting a held child's serverView", () =>
    Effect.gen(function*() {
      class CardSlow extends Context.Service<CardSlow, string>()("test/CardSlowSlottedRemoved") {}
      class FeatureRes extends Context.Service<FeatureRes, string>()("test/SlottedRemovedFeatureRes") {}
      class ChildRes extends Context.Service<ChildRes, string>()("test/SlottedRemovedChildRes") {}
      class PanelFeature extends Feature.Service<PanelFeature>()("test/SlottedRemovedPanel", {
        props: Schema.Struct({})
      }) {}
      let featureAcquires = 0
      let featureReleases = 0
      let childAcquires = 0
      let childReleases = 0
      const makePage = (cardLayer: Layer.Layer<CardSlow>, track: boolean) => {
        const featureResLayer = Layer.effect(
          FeatureRes,
          Effect.acquireRelease(
            Effect.sync(() => {
              if (track) featureAcquires++
              return "f"
            }),
            () =>
              Effect.sync(() => {
                if (track) featureReleases++
              })
          )
        )
        const childResLayer = Layer.effect(
          ChildRes,
          Effect.acquireRelease(
            Effect.sync(() => {
              if (track) childAcquires++
              return "c"
            }),
            () =>
              Effect.sync(() => {
                if (track) childReleases++
              })
          )
        )
        const PanelImpl = Component.define({
          name: "PanelImpl",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.p("panel")
        }).pipe(Component.provide(featureResLayer))
        const Widget = Component.define({
          name: "Widget",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.em("widget")
        }).pipe(Component.provide(childResLayer))
        const Shell = Component.define({
          name: "Shell",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.div(h.slots.body)
        })
        const Box = Component.define({
          name: "Box",
          lifetime: "model",
          props: Schema.Struct({ show: Schema.Boolean }),
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            Shell(h, {
              key: "s",
              slots: {
                body: h.props.show
                  ? [
                    PanelFeature.render(h, { key: "p", props: {}, fallback: () => h.p("loading") }),
                    Widget(h, { key: "w" })
                  ]
                  : h.span("removed")
              }
            })
        }).pipe(Component.provide(PanelFeature.toLayer(PanelImpl)))
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(cardLayer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Boolean,
          message: Schema.Boolean,
          elements: Html
        }).make({
          children: { box: Child.one(Box, { props: (show) => ({ show }) }) },
          init: () => true,
          update: (_, show) => show,
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.box() } })
        })
      }

      const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.succeed(CardSlow, "ready"), false), {})
      const app = yield* makeContainer(rendered.html)
      const releaseCard = yield* Deferred.make<void>()
      const root = yield* BrowserHost.mountEffect(
        makePage(Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard), "ready")), true),
        {},
        app,
        { state: rendered.state }
      )
      yield* tick
      assert.strictEqual(featureAcquires, 1)
      assert.strictEqual(featureReleases, 0)
      assert.strictEqual(childAcquires, 1)
      assert.strictEqual(childReleases, 0)

      root.send(false)
      yield* tick
      assert.strictEqual(featureAcquires, 1)
      assert.strictEqual(featureReleases, 1)
      assert.strictEqual(childAcquires, 1)
      assert.strictEqual(childReleases, 1)

      yield* Deferred.succeed(releaseCard, undefined)
      yield* root.adopted
      yield* tick
      assert.strictEqual(featureAcquires, 1)
      assert.strictEqual(featureReleases, 1)
      assert.strictEqual(childAcquires, 1)
      assert.strictEqual(childReleases, 1)
      assert.strictEqual(app.querySelector("section span")?.textContent, "removed")
      assert.isNull(app.querySelector("section p"))
      assert.isNull(app.querySelector("section em"))
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live("starts element mounts on a child added to a pending Box once its Layer settles", () =>
    Effect.gen(function*() {
      class CardSlow extends Context.Service<CardSlow, string>()("test/CardSlowMountSettle") {}
      class BoxSlow extends Context.Service<BoxSlow, string>()("test/BoxSlowMountSettle") {}
      let started = 0
      let closed = 0
      const Track = Mount.make(
        "Track",
        { args: {} },
        () =>
          Effect.acquireRelease(
            Effect.sync(() => void started++),
            () => Effect.sync(() => void closed++)
          ).pipe(Effect.andThen(Effect.never))
      )
      const Widget = Component.define({
        name: "Widget",
        lifetime: "view",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.b.onMount(Track()).children("widget")
      })
      const makePage = (cardLayer: Layer.Layer<CardSlow>, boxLayer: Layer.Layer<BoxSlow>) => {
        const Box = Component.define({
          name: "Box",
          lifetime: "model",
          props: Schema.Struct({ show: Schema.Boolean }),
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.div(h.props.show ? Widget(h, { key: "w" }) : h.span("empty"))
        }).pipe(Component.provide(boxLayer))
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(cardLayer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Boolean,
          message: Schema.Boolean,
          elements: Html
        }).make({
          children: { box: Child.one(Box, { props: (show) => ({ show }) }) },
          init: () => false,
          update: (_, show) => show,
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.box() } })
        })
      }

      const rendered = yield* HtmlServer.renderToHtml(
        makePage(Layer.succeed(CardSlow, "ready"), Layer.succeed(BoxSlow, "ready")),
        {}
      )
      const app = yield* makeContainer(rendered.html)
      const releaseCard = yield* Deferred.make<void>()
      const releaseBox = yield* Deferred.make<void>()
      const root = yield* BrowserHost.mountEffect(
        makePage(
          Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard), "ready")),
          Layer.effect(BoxSlow, Effect.as(Deferred.await(releaseBox), "ready"))
        ),
        {},
        app,
        { state: rendered.state }
      )
      yield* Deferred.succeed(releaseCard, undefined)
      yield* tick
      root.send(true)
      yield* tick
      assert.strictEqual(started, 0)
      yield* Deferred.succeed(releaseBox, undefined)
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("section b")?.textContent, "widget")
      assert.strictEqual(started, 1)
      assert.strictEqual(closed, 0)
      root.send(false)
      yield* tick
      assert.strictEqual(closed, 1)
    }).pipe(Effect.scoped))

  it.live("delivers sends to a ref inside a pending headless child's closure", () =>
    Effect.gen(function*() {
      class CardSlow extends Context.Service<CardSlow, string>()("test/CardSlowHeadlessSend") {}
      class PanelSlow extends Context.Service<PanelSlow, string>()("test/PanelSlowHeadlessSend") {}
      const LeafMsg = UiSchema.TaggedEnum({ Inc: {} })
      const BoxMsg = UiSchema.TaggedEnum({ Forward: {} })
      const PageMsg = UiSchema.TaggedEnum({ Forward: {} })
      const makePage = (cardLayer: Layer.Layer<CardSlow>, panelLayer: Layer.Layer<PanelSlow>, initial: number) => {
        const Leaf = Component.define({
          name: "Leaf",
          lifetime: "view",
          model: Schema.Number,
          message: LeafMsg,
          receives: ["Inc"],
          elements: Html
        }).make({
          init: () => initial,
          update: (n) => n + 1,
          view: (n, h) => h.p(String(n))
        })
        const LeafRef = Leaf.ref("leaf")
        const Panel = Component.define({
          name: "Panel",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          parts: () => ({})
        }).pipe(Component.provide(panelLayer) as unknown as <C>(component: C) => C)
        const Box = Component.define({
          name: "Box",
          lifetime: "model",
          model: Schema.Null,
          message: BoxMsg,
          receives: ["Forward"],
          elements: Html
        }).make({
          init: () => null,
          update: (_, __, $) => $.send(LeafRef, LeafMsg.Inc()),
          view: (_, h) => h.div(Panel(h, { key: "p", view: () => Leaf(h, { ref: LeafRef }) }))
        })
        const BoxRef = Box.ref("box")
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(cardLayer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Null,
          message: PageMsg,
          elements: Html
        }).make({
          children: { box: Box },
          init: () => null,
          update: (_, __, $) => $.send(BoxRef, BoxMsg.Forward()),
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.box() } })
        })
      }

      const rendered = yield* HtmlServer.renderToHtml(
        makePage(Layer.succeed(CardSlow, "ready"), Layer.succeed(PanelSlow, "ready"), 41),
        {}
      )
      const app = yield* makeContainer(rendered.html)
      const releaseCard = yield* Deferred.make<void>()
      const releasePanel = yield* Deferred.make<void>()
      const log = MessageLog.makeMemory()
      const root = yield* BrowserHost.mountEffect(
        makePage(
          Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard), "ready")),
          Layer.effect(PanelSlow, Effect.as(Deferred.await(releasePanel), "ready")),
          0
        ),
        {},
        app,
        { state: rendered.state }
      ).pipe(Effect.provideService(MessageLog.MessageLog, log))
      yield* Deferred.succeed(releaseCard, undefined)
      yield* tick
      root.send(PageMsg.Forward())
      yield* tick
      yield* Deferred.succeed(releasePanel, undefined)
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("section p")?.textContent, "42")
      assert.deepStrictEqual(log.entries().filter((entry) => entry._tag === "SendDropped"), [])
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live("preserves headless closures during adoption without restarting removed children or duplicating listed placements", () =>
    Effect.gen(function*() {
      class CardSlow extends Context.Service<CardSlow, string>()("test/CardSlowHeadlessAdopt") {}
      class FeatureRes extends Context.Service<FeatureRes, string>()("test/HeadlessRemovedFeatureRes") {}
      class ChildRes extends Context.Service<ChildRes, string>()("test/HeadlessRemovedChildRes") {}
      class PanelFeature extends Feature.Service<PanelFeature>()("test/HeadlessRemovedPanel", {
        props: Schema.Struct({})
      }) {}
      const Headless = Component.define({
        name: "Headless",
        lifetime: "view",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: (model) => model,
        parts: () => ({})
      })
      const Shell = Component.define({
        name: "Shell",
        lifetime: "view",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html,
        slots: ["body"]
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.div(h.slots.body)
      })

      // 1. Removed slotted feature & child inside a headless closure do not restart on adoption.
      let featureAcquires = 0
      let featureReleases = 0
      let childAcquires = 0
      let childReleases = 0
      const makeRemovedPage = (cardLayer: Layer.Layer<CardSlow>, track: boolean) => {
        const PanelImpl = Component.define({
          name: "PanelImpl",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.p("panel")
        }).pipe(
          Component.provide(
            Layer.effect(
              FeatureRes,
              Effect.acquireRelease(
                Effect.sync(() => {
                  if (track) featureAcquires++
                  return "f"
                }),
                () =>
                  Effect.sync(() => {
                    if (track) featureReleases++
                  })
              )
            )
          )
        )
        const Widget = Component.define({
          name: "Widget",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.em("widget")
        }).pipe(
          Component.provide(
            Layer.effect(
              ChildRes,
              Effect.acquireRelease(
                Effect.sync(() => {
                  if (track) childAcquires++
                  return "c"
                }),
                () =>
                  Effect.sync(() => {
                    if (track) childReleases++
                  })
              )
            )
          )
        )
        const Box = Component.define({
          name: "Box",
          lifetime: "model",
          props: Schema.Struct({ show: Schema.Boolean }),
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            Headless(h, {
              key: "h",
              view: () =>
                Shell(h, {
                  key: "s",
                  slots: {
                    body: h.props.show
                      ? [
                        PanelFeature.render(h, { key: "p", props: {}, fallback: () => h.p("loading") }),
                        Widget(h, { key: "w" })
                      ]
                      : h.span("removed")
                  }
                })
            })
        }).pipe(Component.provide(PanelFeature.toLayer(PanelImpl)))
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(cardLayer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Boolean,
          message: Schema.Boolean,
          elements: Html
        }).make({
          children: { box: Child.one(Box, { props: (show) => ({ show }) }) },
          init: () => true,
          update: (_, show) => show,
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.box() } })
        })
      }

      const rendered1 = yield* HtmlServer.renderToHtml(makeRemovedPage(Layer.succeed(CardSlow, "ready"), false), {})
      const app1 = yield* makeContainer(rendered1.html)
      const releaseCard1 = yield* Deferred.make<void>()
      const root1 = yield* BrowserHost.mountEffect(
        makeRemovedPage(Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard1), "ready")), true),
        {},
        app1,
        { state: rendered1.state }
      )
      yield* tick
      root1.send(false)
      yield* tick
      yield* Deferred.succeed(releaseCard1, undefined)
      yield* root1.adopted
      yield* tick
      assert.strictEqual(featureAcquires, 1)
      assert.strictEqual(featureReleases, 1)
      assert.strictEqual(childAcquires, 1)
      assert.strictEqual(childReleases, 1)
      assert.strictEqual(app1.querySelector("section span")?.textContent, "removed")
      assert.notInclude(app1.innerHTML, "<!--")

      // 2. A single h.children.leaf() inside a headless closure in a listed Box adopts cleanly without duplicate placement.
      const Leaf = Component.define({
        name: "Leaf",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.p("leaf")
      })
      const makeLeafPage = (cardLayer: Layer.Layer<CardSlow>) => {
        const Box = Component.define({
          name: "Box",
          lifetime: "model",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          children: { leaf: Leaf },
          init: () => null,
          update: (model) => model,
          view: (_, h) => Headless(h, { key: "h", view: () => h.children.leaf() })
        })
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.slots.body)
        }).pipe(Component.provide(cardLayer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          children: { box: Box },
          init: () => null,
          update: (model) => model,
          view: (_, h) => Card(h, { key: "c", slots: { body: h.children.box() } })
        })
      }

      const rendered2 = yield* HtmlServer.renderToHtml(makeLeafPage(Layer.succeed(CardSlow, "ready")), {})
      const app2 = yield* makeContainer(rendered2.html)
      const releaseCard2 = yield* Deferred.make<void>()
      const root2 = yield* BrowserHost.mountEffect(
        makeLeafPage(Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard2), "ready"))),
        {},
        app2,
        { state: rendered2.state }
      )
      yield* Deferred.succeed(releaseCard2, undefined)
      yield* root2.adopted
      yield* tick
      assert.strictEqual(app2.querySelector("section p")?.textContent, "leaf")
      assert.notInclude(app2.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.effect("serializes a listed model child parked in a collapsed slot during SSR", () =>
    Effect.gen(function*() {
      const RowEvents = UiSchema.TaggedEnum({ Hide: {} })
      const Row = Component.define({
        name: "Row",
        lifetime: "model",
        props: Schema.Struct({ label: Schema.String }),
        model: Schema.String,
        message: Schema.Never,
        events: RowEvents,
        elements: Html
      }).make({
        init: ($) => $.set($.props.label).emit(RowEvents.Hide()),
        update: (model) => model,
        view: (label, h) => h.button(label)
      })
      const Card = Component.define({
        name: "Card",
        lifetime: "view",
        props: Schema.Struct({ open: Schema.Boolean }),
        model: Schema.Null,
        message: Schema.Never,
        elements: Html,
        slots: ["body"]
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.section(h.props.open ? h.slots.body : null)
      })
      const PageMsg = UiSchema.TaggedEnum({ Hide: {}, Show: {} })
      const Page = Component.define({
        name: "Page",
        lifetime: "view",
        model: Schema.Struct({ open: Schema.Boolean, label: Schema.String }),
        message: PageMsg,
        elements: Html
      }).make({
        children: {
          row: Child.one(Row, {
            props: (model) => ({ label: model.label }),
            onEmit: () => PageMsg.Hide()
          })
        },
        init: () => ({ open: true, label: "initial" }),
        update: (model, message) =>
          PageMsg.match(message, {
            Hide: () => ({ open: false, label: "hidden" }),
            Show: () => ({ ...model, open: true })
          }),
        view: (model, h) => Card(h, { key: "c", props: { open: model.open }, slots: { body: h.children.row() } })
      })
      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      assert.notInclude(rendered.html, "<button")
      assert.strictEqual(rendered.state["/Page/Row[row]"], "initial")
      const app = yield* makeContainer(rendered.html)
      const root = yield* BrowserHost.mountEffect(Page, {}, app, { state: rendered.state })
      yield* root.adopted
      root.send(PageMsg.Show())
      yield* tick
      assert.strictEqual(app.querySelector("button")?.textContent, "initial")
    }).pipe(Effect.scoped))
})
