// @vitest-environment happy-dom
import { Child, Component, Feature, MessageLog, Mount, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { HtmlLocator, ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Schema } from "effect"
import { collectGarbage } from "../utils/gc.ts"

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

  it.live("drops and logs a send to a listed child while its receiver waits, and starts it from the server's state", () =>
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
      // The child starts when its receiver's Layer settles: the send came before, as it would to a view child.
      assert.strictEqual(app.querySelector("section p")?.textContent, "41")
      assert.isFalse(log.entries().some((entry) => entry._tag === "Update" && entry.path === "/Page/Counter[counter]"))
      assert.lengthOf(log.entries().filter((entry) => entry._tag === "SendDropped"), 1)
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

      // 2. A single h.children.leaf() inside a headless closure in a listed Box adopts cleanly and survives headless updates.
      const ToggleHeadless = Component.define({
        name: "ToggleHeadless",
        lifetime: "view",
        model: Schema.Boolean,
        message: Schema.Boolean,
        elements: Html
      }).make({
        init: () => false,
        update: (on) => !on,
        parts: (on, p) => ({
          label: on ? "on" : "off",
          toggle: p.part("button", (b) => b.onClick(true))
        })
      })
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
          view: (_, h) =>
            ToggleHeadless(h, {
              key: "h",
              view: (parts) => h.div(parts.toggle(h.button(parts.label)), h.children.leaf())
            })
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
      const app = yield* makeContainer(rendered2.html)
      const releaseCard2 = yield* Deferred.make<void>()
      const root = yield* BrowserHost.mountEffect(
        makeLeafPage(Layer.effect(CardSlow, Effect.as(Deferred.await(releaseCard2), "ready"))),
        {},
        app,
        { state: rendered2.state }
      )
      yield* Deferred.succeed(releaseCard2, undefined)
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("section p")?.textContent, "leaf")
      assert.strictEqual(app.querySelector("section button")?.textContent, "off")
      ;(app.querySelector("section button") as HTMLButtonElement).click()
      yield* tick
      assert.strictEqual(app.querySelector("section p")?.textContent, "leaf")
      assert.strictEqual(app.querySelector("section button")?.textContent, "on")
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live("restores a controlled input inside an h.lazy headless child on author update", () =>
    Effect.gen(function*() {
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
      })
      const PageDef = Component.define({
        name: "Page",
        lifetime: "view",
        model: Schema.Number,
        message: Schema.Number,
        elements: Html
      })
      const panel = (h: Component.Helper<typeof PageDef>) => Panel(h, { key: "p", view: () => h.input.value("fixed") })
      const Page = PageDef.make({
        init: () => 0,
        update: (n) => n + 1,
        view: (n, h) => h.div(h.output(String(n)), h.lazy(panel))
      })
      const app = yield* makeContainer()
      const root = yield* BrowserHost.mountEffect(Page, {}, app)
      yield* tick
      const input = app.querySelector("input") as HTMLInputElement
      assert.strictEqual(input.value, "fixed")
      input.value = "edited"
      root.send(1)
      yield* tick
      assert.strictEqual(app.querySelector("output")?.textContent, "1")
      assert.strictEqual(app.querySelector("input"), input)
      assert.strictEqual(input.value, "fixed")
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

describe("model children drawn while a Layer waits", () => {
  it.live("replaces a failed listed child that was a view's root with an element", () =>
    Effect.gen(function*() {
      const ScreenMsg = UiSchema.TaggedEnum({ Break: {} })
      const Screen = Component.define({
        name: "Screen",
        lifetime: "model",
        model: Schema.Null,
        message: ScreenMsg,
        elements: Html
      }).make({
        init: () => null,
        update: () => {
          throw new Error("boom")
        },
        view: (_, h) => h.button.onClick(ScreenMsg.Break()).children("screen")
      })
      const Page = Component.define({
        name: "Page",
        lifetime: "view",
        model: Schema.Boolean,
        message: Schema.Boolean,
        elements: Html
      }).make({
        children: { screen: Screen },
        init: () => true,
        update: (_, show) => show,
        view: (show, h) => show ? h.children.screen() : h.p("other")
      })
      const app = yield* makeContainer()
      const root = yield* BrowserHost.mountEffect(Page, {}, app)
      yield* tick
      ;(app.querySelector("button") as HTMLButtonElement).click()
      yield* tick
      root.send(false)
      yield* tick
      assert.strictEqual(app.textContent, "other")
    }).pipe(Effect.scoped))

  const fieldPage = (name: string) => {
    class Slow extends Context.Service<Slow, string>()("test/" + name) {}
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
      view: (value, h) => h.div(h.input.value(value).onInput(({ value }) => FieldMsg.Typed({ value })), h.output(value))
    })
    const Where = Schema.Literals(["card", "aside", "hidden", "gone"])
    const makePage = (layer: Layer.Layer<Slow>) => {
      const Card = Component.define({
        name: "Card",
        lifetime: "view",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html,
        slots: ["body"]
      }).make({ init: () => null, update: (model) => model, view: (_, h) => h.section(h.slots.body) })
        .pipe(Component.provide(layer))
      return Component.define({ name: "Page", lifetime: "view", model: Where, message: Where, elements: Html }).make({
        children: { field: Field },
        init: () => "card" as const,
        update: (_, where) => where,
        view: (where, h) =>
          h.main(
            where === "gone"
              ? null
              : Card(h, { key: "c", slots: { body: where === "card" ? h.children.field() : null } }),
            h.aside(where === "aside" ? h.children.field() : null)
          )
      })
    }
    return Effect.gen(function*() {
      const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.succeed(Slow, "ready")), {})
      const app = yield* makeContainer(rendered.html)
      const release = yield* Deferred.make<void>()
      const root = yield* BrowserHost.mountEffect(
        makePage(Layer.effect(Slow, Effect.as(Deferred.await(release), "ready"))),
        {},
        app,
        { state: rendered.state }
      )
      return { app, root, release }
    })
  }

  it.live("keeps an edit typed while waiting when a ready sibling draws the field", () =>
    Effect.gen(function*() {
      const { app, release, root } = yield* fieldPage("E1")
      HtmlLocator.type(app.querySelector("section input") as HTMLInputElement, "typed")
      root.send("aside")
      yield* tick
      assert.strictEqual((app.querySelector("aside input") as HTMLInputElement).value, "typed")
      assert.strictEqual(app.querySelector("aside output")?.textContent, "typed")
      yield* Deferred.succeed(release, undefined)
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("section")?.textContent, "")
      assert.strictEqual((app.querySelector("aside input") as HTMLInputElement).value, "typed")
      assert.strictEqual(app.querySelector("aside output")?.textContent, "typed")
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.live("delivers an edit typed while waiting to a field parked before adoption", () =>
    Effect.gen(function*() {
      const { app, release, root } = yield* fieldPage("E2")
      HtmlLocator.type(app.querySelector("section input") as HTMLInputElement, "typed")
      root.send("hidden")
      yield* tick
      yield* Deferred.succeed(release, undefined)
      yield* root.adopted
      yield* tick
      root.send("aside")
      yield* tick
      assert.strictEqual((app.querySelector("aside input") as HTMLInputElement).value, "typed")
      assert.strictEqual(app.querySelector("aside output")?.textContent, "typed")
    }).pipe(Effect.scoped))

  it.live("keeps an edit typed while waiting when the field's waiting receiver is removed", () =>
    Effect.gen(function*() {
      const { app, release, root } = yield* fieldPage("E3")
      HtmlLocator.type(app.querySelector("section input") as HTMLInputElement, "typed")
      root.send("gone")
      yield* tick
      yield* root.adopted
      root.send("aside")
      yield* tick
      assert.strictEqual((app.querySelector("aside input") as HTMLInputElement).value, "typed")
      assert.strictEqual(app.querySelector("aside output")?.textContent, "typed")
      yield* Deferred.succeed(release, undefined)
    }).pipe(Effect.scoped))

  it.live("starts a child listed on the client while an unrelated Layer waits", () =>
    Effect.gen(function*() {
      class Slow extends Context.Service<Slow, string>()("test/F2") {}
      const CounterMsg = UiSchema.TaggedEnum({ Inc: {} })
      const Counter = Component.define({
        name: "Counter",
        lifetime: "model",
        model: Schema.Number,
        message: CounterMsg,
        receives: ["Inc"],
        elements: Html
      }).make({ init: () => 0, update: (n) => n + 1, view: (n, h) => h.b(String(n)) })
      const PageMsg = UiSchema.TaggedEnum({ List: {}, Inc: {}, Show: {} })
      const State = Schema.Literals(["none", "listed", "shown"])
      const makePage = (layer: Layer.Layer<Slow>) => {
        const Sidebar = Component.define({
          name: "Sidebar",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => null, update: (m) => m, view: (_, h) => h.nav("sidebar") })
          .pipe(Component.provide(layer))
        return Component.define({ name: "Page", lifetime: "view", model: State, message: PageMsg, elements: Html })
          .make({
            children: { counter: Child.optional(Counter, { props: (state) => state === "none" ? null : {} }) },
            init: () => "none" as const,
            update: (state, message, $) =>
              PageMsg.match(message, {
                List: () => "listed" as const,
                Inc: () => $.set(state).send(Counter.ref("counter"), CounterMsg.Inc()),
                Show: () => "shown" as const
              }),
            view: (state, h) =>
              h.main(Sidebar(h, { key: "s" }), state === "shown" ? h.children.counter?.() ?? null : null)
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
      yield* tick
      root.send(PageMsg.List())
      yield* tick
      root.send(PageMsg.Inc())
      yield* tick
      root.send(PageMsg.Show())
      yield* tick
      assert.strictEqual(app.querySelector("b")?.textContent, "1")
      yield* Deferred.succeed(release, undefined)
    }).pipe(Effect.scoped))

  it.live("starts a child the server didn't draw while an unrelated Layer waits", () =>
    Effect.gen(function*() {
      class Slow extends Context.Service<Slow, string>()("test/F") {}
      const CounterMsg = UiSchema.TaggedEnum({ Inc: {} })
      const Counter = Component.define({
        name: "Counter",
        lifetime: "model",
        model: Schema.Number,
        message: CounterMsg,
        receives: ["Inc"],
        elements: Html
      }).make({ init: () => 41, update: (n) => n + 1, view: (n, h) => h.b(String(n)) })
      const CounterRef = Counter.ref("counter")
      const PageMsg = UiSchema.TaggedEnum({ Inc: {}, Show: {} })
      const makePage = (layer: Layer.Layer<Slow>) => {
        const Sidebar = Component.define({
          name: "Sidebar",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => null, update: (m) => m, view: (_, h) => h.nav("sidebar") })
          .pipe(Component.provide(layer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Boolean,
          message: PageMsg,
          elements: Html
        }).make({
          children: { counter: Counter },
          init: () => false,
          update: (shown, message, $) =>
            PageMsg.match(message, { Inc: () => $.set(shown).send(CounterRef, CounterMsg.Inc()), Show: () => true }),
          view: (shown, h) => h.main(Sidebar(h, { key: "s" }), shown ? h.children.counter() : null)
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
      yield* tick
      root.send(PageMsg.Inc())
      yield* tick
      root.send(PageMsg.Show())
      yield* tick
      assert.strictEqual(app.querySelector("b")?.textContent, "42")
      yield* Deferred.succeed(release, undefined)
    }).pipe(Effect.scoped))

  const editorPage = (name: string, counts: { acquires: number; side: number }) => {
    class SlowCard extends Context.Service<SlowCard, string>()("test/" + name + "Card") {}
    class SlowSide extends Context.Service<SlowSide, string>()("test/" + name + "Side") {}
    class Conn extends Context.Service<Conn, string>()("test/" + name + "Conn") {}
    const Editor = Component.define({
      name: "Editor",
      lifetime: "model",
      props: Schema.Struct({ seed: Schema.String }),
      model: Schema.String,
      message: Schema.Never,
      elements: Html
    }).make({
      init: ($) => (counts.side++ === 0 ? "server:" : "client:") + $.props.seed,
      update: (m) => m,
      view: (m, h) => h.p(m)
    }).pipe(Component.provide(Layer.effect(
      Conn,
      Effect.acquireRelease(
        Effect.sync(() => {
          counts.acquires++
          return "c"
        }),
        () => Effect.void
      )
    )))
    const Seed = Schema.NullOr(Schema.String)
    const make = (card: Layer.Layer<SlowCard>, side: Layer.Layer<SlowSide>) => {
      const Card = Component.define({
        name: "Card",
        lifetime: "view",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html,
        slots: ["body"]
      }).make({ init: () => null, update: (m) => m, view: (_, h) => h.section(h.slots.body) })
        .pipe(Component.provide(card))
      const Sidebar = Component.define({
        name: "Sidebar",
        lifetime: "view",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({ init: () => null, update: (m) => m, view: (_, h) => h.nav("sidebar") })
        .pipe(Component.provide(side))
      return Component.define({ name: "Page", lifetime: "view", model: Seed, message: Seed, elements: Html }).make({
        children: { editor: Child.optional(Editor, { props: (seed) => seed === null ? null : { seed } }) },
        init: () => "one",
        update: (_, seed) => seed,
        view: (_, h) =>
          h.main(Card(h, { key: "c", slots: { body: h.children.editor?.() ?? null } }), Sidebar(h, { key: "s" }))
      })
    }
    return Effect.gen(function*() {
      const rendered = yield* HtmlServer.renderToHtml(
        make(Layer.succeed(SlowCard, "r"), Layer.succeed(SlowSide, "r")),
        {}
      )
      const app = yield* makeContainer(rendered.html)
      const card = yield* Deferred.make<void>()
      const side = yield* Deferred.make<void>()
      counts.acquires = 0
      const root = yield* BrowserHost.mountEffect(
        make(
          Layer.effect(SlowCard, Effect.as(Deferred.await(card), "r")),
          Layer.effect(SlowSide, Effect.as(Deferred.await(side), "r"))
        ),
        {},
        app,
        { state: rendered.state }
      )
      return { app, root, card, side }
    })
  }

  it.live("doesn't start a child unlisted while its receiver waits", () =>
    Effect.gen(function*() {
      const counts = { acquires: 0, side: 0 }
      const { app, card, root, side } = yield* editorPage("G1", counts)
      yield* tick
      root.send(null)
      yield* tick
      yield* Deferred.succeed(card, undefined)
      yield* tick
      assert.strictEqual(counts.acquires, 0)
      assert.strictEqual(app.querySelector("section")?.textContent, "")
      yield* Deferred.succeed(side, undefined)
      yield* root.adopted
      yield* tick
      assert.strictEqual(counts.acquires, 0)
    }).pipe(Effect.scoped))

  it.live("starts a child unlisted and listed again before adoption fresh", () =>
    Effect.gen(function*() {
      const counts = { acquires: 0, side: 0 }
      const { app, card, root, side } = yield* editorPage("G2", counts)
      yield* tick
      root.send(null)
      yield* tick
      root.send("two")
      yield* tick
      yield* Deferred.succeed(card, undefined)
      yield* Deferred.succeed(side, undefined)
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("section")?.textContent, "client:two")
    }).pipe(Effect.scoped))

  it.live("draws a child listed again after its waiting receiver adopted without it", () =>
    Effect.gen(function*() {
      const counts = { acquires: 0, side: 0 }
      const { app, card, root, side } = yield* editorPage("A1", counts)
      yield* tick
      root.send(null)
      yield* tick
      yield* Deferred.succeed(card, undefined)
      yield* tick
      root.send("two")
      yield* tick
      assert.strictEqual(app.querySelector("section")?.textContent, "client:two")
      yield* Deferred.succeed(side, undefined)
    }).pipe(Effect.scoped))

  /** A Field in a waiting Card's slot, listed by Compose, next to a Sidebar with its own pending Layer. */
  const composePage = (name: string, fieldLayer: Layer.Layer<never> = Layer.empty) => {
    // The server builds the field's Layer at once; the client builds `fieldLayer`.
    class SlowCard extends Context.Service<SlowCard, string>()("test/" + name + "Card") {}
    class SlowSide extends Context.Service<SlowSide, string>()("test/" + name + "Side") {}
    const FieldMsg = UiSchema.TaggedEnum({ Typed: { value: Schema.String } })
    // A view child of the field owns the input.
    const Input = Component.define({
      name: "Input",
      lifetime: "view",
      model: Schema.String,
      message: FieldMsg,
      elements: Html
    }).make({
      init: () => "server",
      update: (_, { value }) => value,
      view: (value, h) => h.input.value(value).onInput(({ value }) => FieldMsg.Typed({ value }))
    })
    const fieldOf = (layer: Layer.Layer<never>) =>
      Component.define({
        name: "Field",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({ init: () => null, update: (m) => m, view: (_, h) => h.div(Input(h, { key: "i" })) })
        .pipe(Component.provide(layer))
    const ShellMsg = UiSchema.TaggedEnum({ Drop: {} })
    const make = (card: Layer.Layer<SlowCard>, side: Layer.Layer<SlowSide>, field: Layer.Layer<never>) => {
      const Field = fieldOf(field)
      const Card = Component.define({
        name: "Card",
        lifetime: "view",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html,
        slots: ["body"]
      }).make({ init: () => null, update: (m) => m, view: (_, h) => h.section(h.slots.body) })
        .pipe(Component.provide(card))
      const Sidebar = Component.define({
        name: "Sidebar",
        lifetime: "view",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({ init: () => null, update: (m) => m, view: (_, h) => h.nav("sidebar") })
        .pipe(Component.provide(side))
      const Compose = Component.define({
        name: "Compose",
        lifetime: "view",
        props: Schema.Struct({ aside: Schema.Boolean }),
        model: Schema.Boolean,
        message: ShellMsg,
        elements: Html
      }).make({
        children: { field: Field },
        init: () => true,
        update: () => false,
        view: (card, h) =>
          h.div(
            h.button.onClick(ShellMsg.Drop()).children("drop"),
            card ? Card(h, { key: "c", slots: { body: h.props.aside ? null : h.children.field() } }) : null,
            h.aside(h.props.aside ? h.children.field() : null)
          )
      })
      const State = Schema.Literals(["open", "closed", "aside"])
      return Component.define({ name: "Page", lifetime: "view", model: State, message: State, elements: Html }).make({
        init: () => "open" as const,
        update: (_, next) => next,
        view: (state, h) =>
          h.main(
            state === "closed" ? null : Compose(h, { key: "c", props: { aside: state === "aside" } }),
            Sidebar(h, { key: "s" })
          )
      })
    }
    return Effect.gen(function*() {
      const rendered = yield* HtmlServer.renderToHtml(
        make(Layer.succeed(SlowCard, "r"), Layer.succeed(SlowSide, "r"), Layer.empty),
        {}
      )
      const app = yield* makeContainer(rendered.html)
      const card = yield* Deferred.make<void>()
      const side = yield* Deferred.make<void>()
      const root = yield* BrowserHost.mountEffect(
        make(
          Layer.effect(SlowCard, Effect.as(Deferred.await(card), "r")),
          Layer.effect(SlowSide, Effect.as(Deferred.await(side), "r")),
          fieldLayer
        ),
        {},
        app,
        { state: rendered.state }
      )
      return { app, root, card, side }
    })
  }

  it.live("doesn't give a field's server nodes to a lister made after the one that listed it", () =>
    Effect.gen(function*() {
      const { app, card, root, side } = yield* composePage("R1")
      HtmlLocator.type(app.querySelector("section input") as HTMLInputElement, "typed")
      root.send("closed")
      yield* tick
      root.send("open")
      yield* tick
      yield* Deferred.succeed(card, undefined)
      yield* tick
      assert.strictEqual((app.querySelector("section input") as HTMLInputElement).value, "server")
      yield* Deferred.succeed(side, undefined)
    }).pipe(Effect.scoped))

  it.live("starts a field when a view child of its lister removes its waiting Card, while another Layer waits", () =>
    Effect.gen(function*() {
      class SlowCard extends Context.Service<SlowCard, string>()("test/R2Card") {}
      class SlowSide extends Context.Service<SlowSide, string>()("test/R2Side") {}
      let acquired = 0
      const conn = Layer.effectDiscard(Effect.sync(() => acquired++))
      const ShellMsg = UiSchema.TaggedEnum({ Drop: {} })
      const make = (card: Layer.Layer<SlowCard>, side: Layer.Layer<SlowSide>, field: Layer.Layer<never>) => {
        const Field = Component.define({
          name: "Field",
          lifetime: "model",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => null, update: (m) => m, view: (_, h) => h.input }).pipe(Component.provide(field))
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({ init: () => null, update: (m) => m, view: (_, h) => h.section(h.slots.body) })
          .pipe(Component.provide(card))
        const Sidebar = Component.define({
          name: "Sidebar",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => null, update: (m) => m, view: (_, h) => h.nav("sidebar") })
          .pipe(Component.provide(side))
        // Drops its Card on its own update: Page, which lists the field, doesn't render again.
        const Shell = Component.define({
          name: "Shell",
          lifetime: "view",
          model: Schema.Boolean,
          message: ShellMsg,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => true,
          update: () => false,
          view: (card, h) =>
            h.div(
              h.button.onClick(ShellMsg.Drop()).children("drop"),
              card ? Card(h, { key: "c", slots: { body: h.slots.body } }) : null
            )
        })
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        })
          .make({
            children: { field: Field },
            init: () => null,
            update: (m) => m,
            view: (_, h) =>
              h.main(Shell(h, { key: "s", slots: { body: h.children.field() } }), Sidebar(h, { key: "n" }))
          })
      }
      const rendered = yield* HtmlServer.renderToHtml(
        make(Layer.succeed(SlowCard, "r"), Layer.succeed(SlowSide, "r"), Layer.empty),
        {}
      )
      const app = yield* makeContainer(rendered.html)
      const card = yield* Deferred.make<void>()
      const side = yield* Deferred.make<void>()
      yield* BrowserHost.mountEffect(
        make(
          Layer.effect(SlowCard, Effect.as(Deferred.await(card), "r")),
          Layer.effect(SlowSide, Effect.as(Deferred.await(side), "r")),
          conn
        ),
        {},
        app,
        { state: rendered.state }
      )
      yield* tick
      assert.strictEqual(acquired, 0)
      ;(app.querySelector("button") as HTMLButtonElement).click()
      yield* tick
      assert.strictEqual(acquired, 1)
      yield* Deferred.succeed(side, undefined)
      yield* Deferred.succeed(card, undefined)
    }).pipe(Effect.scoped))

  it.live("waits for a rescued field's own Layer before it reports adoption, and keeps its edit", () =>
    Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const { app, card, root, side } = yield* composePage(
        "R3",
        Layer.effectDiscard(Deferred.await(gate))
      )
      let adopted = false
      yield* Effect.forkScoped(Effect.tap(root.adopted, () => Effect.sync(() => adopted = true)))
      yield* Deferred.succeed(side, undefined)
      yield* tick
      HtmlLocator.type(app.querySelector("section input") as HTMLInputElement, "typed")
      ;(app.querySelector("button") as HTMLButtonElement).click()
      yield* tick
      assert.isFalse(adopted)
      yield* Deferred.succeed(gate, undefined)
      yield* root.adopted
      yield* tick
      root.send("aside")
      yield* tick
      assert.strictEqual((app.querySelector("aside input") as HTMLInputElement).value, "typed")
      yield* Deferred.succeed(card, undefined)
    }).pipe(Effect.scoped))

  it.live("starts a child unlisted while its receiver waits and listed again offscreen", () =>
    Effect.gen(function*() {
      class Slow extends Context.Service<Slow, string>()("test/R4") {}
      const CounterMsg = UiSchema.TaggedEnum({ Inc: {} })
      const Counter = Component.define({
        name: "Counter",
        lifetime: "model",
        model: Schema.Number,
        message: CounterMsg,
        receives: ["Inc"],
        elements: Html
      }).make({ init: () => 0, update: (n) => n + 1, view: (n, h) => h.b(String(n)) })
      const State = Schema.Literals(["card", "none", "off", "shown"])
      const PageMsg = UiSchema.TaggedEnum({ Go: { to: State }, Inc: {} })
      const makePage = (layer: Layer.Layer<Slow>) => {
        const Card = Component.define({
          name: "Card",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({ init: () => null, update: (m) => m, view: (_, h) => h.section(h.slots.body) })
          .pipe(Component.provide(layer))
        return Component.define({ name: "Page", lifetime: "view", model: State, message: PageMsg, elements: Html })
          .make({
            children: { counter: Child.optional(Counter, { props: (state) => state === "none" ? null : {} }) },
            init: () => "card" as const,
            update: (state, message, $) =>
              PageMsg.match(message, {
                Go: ({ to }) => to,
                Inc: () => $.set(state).send(Counter.ref("counter"), CounterMsg.Inc())
              }),
            view: (state, h) =>
              h.main(
                Card(h, { key: "c", slots: { body: state === "card" ? h.children.counter?.() ?? null : null } }),
                h.aside(state === "shown" ? h.children.counter?.() ?? null : null)
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
      yield* tick
      root.send(PageMsg.Go({ to: "none" }))
      yield* tick
      root.send(PageMsg.Go({ to: "off" }))
      yield* tick
      root.send(PageMsg.Inc())
      yield* tick
      root.send(PageMsg.Go({ to: "shown" }))
      yield* tick
      assert.strictEqual(app.querySelector("aside b")?.textContent, "1")
      yield* Deferred.succeed(release, undefined)
    }).pipe(Effect.scoped))

  it.live("looks up each listed row's server nodes in a waiting Frame without walking it again", () =>
    Effect.gen(function*() {
      class Slow extends Context.Service<Slow, string>()("test/R5") {}
      const Row = Component.define({
        name: "Row",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      })
        .make({ init: () => null, update: (m) => m, view: (_, h) => h.i("row") })
      const keys = Array.from({ length: 50 }, (_, i) => String(i))
      const makePage = (layer: Layer.Layer<Slow>) => {
        const Frame = Component.define({
          name: "Frame",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({ init: () => null, update: (m) => m, view: (_, h) => h.section(h.slots.body) })
          .pipe(Component.provide(layer))
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Number,
          message: Schema.Number,
          elements: Html
        })
          .make({
            children: { rows: Child.keyed(Row, { props: () => keys.map((key) => [key, {}] as const) }) },
            init: () => 0,
            update: (_, n) => n,
            view: (n, h) =>
              h.main(
                Frame(h, { key: "f", slots: { body: keys.map((key) => h.children.rows(key)) } }),
                h.output(String(n))
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
      yield* tick
      let reads = 0
      let proto: object | null = app.ownerDocument.createComment("")
      let descriptor: PropertyDescriptor | undefined
      while (proto !== null && (descriptor = Object.getOwnPropertyDescriptor(proto, "data")) === undefined) {
        proto = Object.getPrototypeOf(proto)
      }
      const get = descriptor!.get!
      Object.defineProperty(proto, "data", {
        ...descriptor,
        get(this: CharacterData) {
          if (this.nodeType === 8) reads++
          return get.call(this)
        }
      })
      try {
        root.send(1)
        yield* tick
      } finally {
        Object.defineProperty(proto, "data", descriptor!)
      }
      assert.strictEqual(app.querySelector("output")?.textContent, "1")
      assert.isBelow(reads, keys.length)
      yield* Deferred.succeed(release, undefined)
    }).pipe(Effect.scoped))

  /** A view component with one slot whose Layer is `layer`. */
  const slowCard = (name: string, layer: Layer.Layer<never>) =>
    Component.define({
      name,
      lifetime: "view",
      model: Schema.Null,
      message: Schema.Never,
      elements: Html,
      slots: ["body"]
    })
      .make({ init: () => null, update: (m) => m, view: (_, h) => h.section(h.slots.body) })
      .pipe(Component.provide(layer))
  const gated = (gate: Deferred.Deferred<void>) => Layer.effectDiscard(Deferred.await(gate))

  it.live("keeps a field's edit when its Frame and the field leave a waiting Card in one update", () =>
    Effect.gen(function*() {
      const Field = Component.define({
        name: "Field",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      })
        .make({ init: () => null, update: (m) => m, view: (_, h) => h.input })
      const Frame = Component.define({
        name: "Frame",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html,
        slots: ["body"]
      }).make({ init: () => null, update: (m) => m, view: (_, h) => h.article(h.slots.body) })
      const makePage = (layer: Layer.Layer<never>) => {
        const Card = slowCard("Card", layer)
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Boolean,
          message: Schema.Boolean,
          elements: Html
        })
          .make({
            children: { frame: Frame, field: Field },
            init: () => false,
            update: (_, moved) => moved,
            // The aside comes first: Frame takes its server nodes before the footer draws the field.
            view: (moved, h) =>
              h.main(
                Card(h, {
                  key: "c",
                  slots: { body: moved ? null : h.children.frame({ slots: { body: h.children.field() } }) }
                }),
                h.aside(moved ? h.children.frame() : null),
                h.footer(moved ? h.children.field() : null)
              )
          })
      }
      const gate = yield* Deferred.make<void>()
      const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.empty), {})
      const app = yield* makeContainer(rendered.html)
      const root = yield* BrowserHost.mountEffect(makePage(gated(gate)), {}, app, { state: rendered.state })
      HtmlLocator.type(app.querySelector("section input") as HTMLInputElement, "typed")
      root.send(true)
      yield* tick
      assert.strictEqual((app.querySelector("footer input") as HTMLInputElement).value, "typed")
      yield* Deferred.succeed(gate, undefined)
    }).pipe(Effect.scoped))

  /**
   * A Page whose Frame draws Field, and a plain input after it if `plain`, in a Card at first: `"aside"`
   * moves Frame to an aside with the same slot, and `"hidden"` moves it there without Field.
   */
  const movingFrame = (card: Layer.Layer<never>, frame: Layer.Layer<never>, plain: boolean) => {
    const Card = slowCard("Card", card)
    const Field = Component.define({
      name: "Field",
      lifetime: "model",
      model: Schema.Null,
      message: Schema.Never,
      elements: Html
    })
      .make({ init: () => null, update: (m) => m, view: (_, h) => h.input.attr("name", "field") })
    const Frame = Component.define({
      name: "Frame",
      lifetime: "model",
      model: Schema.Null,
      message: Schema.Never,
      elements: Html,
      slots: ["body"]
    }).make({ init: () => null, update: (m) => m, view: (_, h) => h.article(h.slots.body) })
      .pipe(Component.provide(frame))
    const State = Schema.Literals(["card", "aside", "hidden"])
    return Component.define({ name: "Page", lifetime: "view", model: State, message: State, elements: Html })
      .make({
        children: { frame: Frame, field: Field },
        init: () => "card" as const,
        update: (_, state) => state,
        view: (state, h) => {
          const frame = h.children.frame({
            slots: {
              body: state === "hidden" ? null : [h.children.field(), plain ? h.input.attr("name", "plain") : null]
            }
          })
          return h.main(
            Card(h, { key: "c", slots: { body: state === "card" ? frame : null } }),
            h.aside(state === "card" ? null : frame)
          )
        }
      })
  }

  for (const first of ["card", "frame"] as const) {
    it.live(`keeps a field's edit when its waiting Frame leaves a waiting Card, the ${first} settling first`, () =>
      Effect.gen(function*() {
        const card = yield* Deferred.make<void>()
        const frame = yield* Deferred.make<void>()
        const rendered = yield* HtmlServer.renderToHtml(movingFrame(Layer.empty, Layer.empty, false), {})
        const app = yield* makeContainer(rendered.html)
        const root = yield* BrowserHost.mountEffect(movingFrame(gated(card), gated(frame), false), {}, app, {
          state: rendered.state
        })
        yield* tick
        const input = app.querySelector("input")!
        HtmlLocator.type(input, "typed")
        root.send("aside")
        yield* tick
        assert.strictEqual(app.querySelector("aside input"), input)
        for (const gate of first === "card" ? [card, frame] : [frame, card]) {
          yield* Deferred.succeed(gate, undefined)
          yield* tick
        }
        yield* root.adopted
        assert.strictEqual(app.querySelector("aside input"), input)
        assert.strictEqual(input.value, "typed")
      }).pipe(Effect.scoped))
  }

  it.live("keeps a field's edit when its Frame leaves a waiting Card without it and shows it after adoption", () =>
    Effect.gen(function*() {
      const card = yield* Deferred.make<void>()
      const rendered = yield* HtmlServer.renderToHtml(movingFrame(Layer.empty, Layer.empty, false), {})
      const app = yield* makeContainer(rendered.html)
      const root = yield* BrowserHost.mountEffect(movingFrame(gated(card), Layer.empty, false), {}, app, {
        state: rendered.state
      })
      yield* tick
      HtmlLocator.type(app.querySelector("input")!, "typed")
      root.send("hidden")
      yield* tick
      yield* Deferred.succeed(card, undefined)
      yield* root.adopted
      yield* tick
      root.send("aside")
      yield* tick
      assert.strictEqual((app.querySelector("aside input") as HTMLInputElement | null)?.value, "typed")
    }).pipe(Effect.scoped))

  it.live("keeps an input after a field in a Frame that leaves a waiting Card", () =>
    Effect.gen(function*() {
      const card = yield* Deferred.make<void>()
      const rendered = yield* HtmlServer.renderToHtml(movingFrame(Layer.empty, Layer.empty, true), {})
      const app = yield* makeContainer(rendered.html)
      const root = yield* BrowserHost.mountEffect(movingFrame(gated(card), Layer.empty, true), {}, app, {
        state: rendered.state
      })
      yield* tick
      const plain = app.querySelector("input[name=plain]") as HTMLInputElement
      HtmlLocator.type(plain, "typed")
      root.send("aside")
      yield* tick
      assert.strictEqual(app.querySelector("aside input[name=plain]"), plain)
      assert.strictEqual(plain.value, "typed")
      yield* Deferred.succeed(card, undefined)
    }).pipe(Effect.scoped))

  it.live("looks up each listed row's server nodes once when each row waits in a Frame of its own", () =>
    Effect.gen(function*() {
      const Row = Component.define({
        name: "Row",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      })
        .make({ init: () => null, update: (m) => m, view: (_, h) => h.i("row") })
      const keys = Array.from({ length: 50 }, (_, i) => String(i))
      const makePage = (layer: Layer.Layer<never>) => {
        const Frame = slowCard("Frame", layer)
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Number,
          message: Schema.Number,
          elements: Html
        })
          .make({
            children: { rows: Child.keyed(Row, { props: () => keys.map((key) => [key, {}] as const) }) },
            init: () => 0,
            update: (_, n) => n,
            view: (n, h) =>
              h.main(
                keys.map((key) => Frame(h, { key, slots: { body: h.children.rows(key) } })),
                h.output(String(n))
              )
          })
      }
      const release = yield* Deferred.make<void>()
      const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.empty), {})
      const app = yield* makeContainer(rendered.html)
      const root = yield* BrowserHost.mountEffect(makePage(gated(release)), {}, app, { state: rendered.state })
      yield* tick
      // Counts the lookups of a row's path in any map while Page renders again.
      let lookups = 0
      const { get, has } = Map.prototype
      const counted = <A extends Array<unknown>, B>(f: (this: Map<unknown, unknown>, ...args: A) => B) =>
        function(this: Map<unknown, unknown>, ...args: A): B {
          if (typeof args[0] === "string" && args[0].startsWith("/Page/Row[")) lookups++
          return f.apply(this, args)
        }
      // oxlint-disable-next-line no-extend-native
      Map.prototype.get = counted(get)
      // oxlint-disable-next-line no-extend-native
      Map.prototype.has = counted(has)
      try {
        root.send(1)
        yield* tick
      } finally {
        // oxlint-disable-next-line no-extend-native
        Map.prototype.get = get
        // oxlint-disable-next-line no-extend-native
        Map.prototype.has = has
      }
      assert.strictEqual(app.querySelector("output")?.textContent, "1")
      assert.isBelow(lookups, keys.length * 4)
      yield* Deferred.succeed(release, undefined)
    }).pipe(Effect.scoped))

  it.live("starts each field whose lister's view children remove their waiting Cards in turn", () =>
    Effect.gen(function*() {
      const started = { a: 0, b: 0 }
      const ShellMsg = UiSchema.TaggedEnum({ Drop: {} })
      // Each with a Layer of its own, so that each start builds one.
      const field = (key: "a" | "b") =>
        Component.define({
          name: "Field",
          lifetime: "model",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        })
          .make({ init: () => null, update: (m) => m, view: (_, h) => h.input })
          .pipe(Component.provide(Layer.effectDiscard(Effect.sync(() => started[key]++))))
      const FieldA = field("a")
      const FieldB = field("b")
      const makePage = (card: Layer.Layer<never>, side: Layer.Layer<never>) => {
        const Card = slowCard("Card", card)
        const Sidebar = slowCard("Sidebar", side)
        // Drops its Card, and the field in it, on its own update: Page, which lists the fields, doesn't
        // render again.
        const Shell = Component.define({
          name: "Shell",
          lifetime: "view",
          model: Schema.Boolean,
          message: ShellMsg,
          elements: Html,
          slots: ["body"]
        }).make({
          init: () => true,
          update: () => false,
          view: (card, h) =>
            h.div(
              h.button.onClick(ShellMsg.Drop()).children("drop"),
              card ? Card(h, { key: "c", slots: { body: h.slots.body } }) : null
            )
        })
        return Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        })
          .make({
            children: { a: FieldA, b: FieldB },
            init: () => null,
            update: (m) => m,
            view: (_, h) =>
              h.main(
                Shell(h, { key: "a", slots: { body: h.children.a() } }),
                Shell(h, { key: "b", slots: { body: h.children.b() } }),
                Sidebar(h, { key: "n", slots: { body: null } })
              )
          })
      }
      const card = yield* Deferred.make<void>()
      const side = yield* Deferred.make<void>()
      const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.empty, Layer.empty), {})
      const app = yield* makeContainer(rendered.html)
      yield* BrowserHost.mountEffect(makePage(gated(card), gated(side)), {}, app, { state: rendered.state })
      yield* tick
      const [first, second] = Array.from(app.querySelectorAll("button"))
      first.click()
      yield* tick
      second.click()
      yield* tick
      // The server's builds count too.
      assert.deepStrictEqual(started, { a: 2, b: 2 })
      yield* Deferred.succeed(side, undefined)
      yield* Deferred.succeed(card, undefined)
    }).pipe(Effect.scoped))

  it.live("starts the children of a lister unlisted while its receiver waits and listed again elsewhere", () =>
    Effect.gen(function*() {
      const CounterMsg = UiSchema.TaggedEnum({ Inc: {} })
      const Counter = Component.define({
        name: "Counter",
        lifetime: "model",
        model: Schema.Number,
        message: CounterMsg,
        receives: ["Inc"],
        elements: Html
      }).make({ init: () => 0, update: (n) => n + 1, view: (n, h) => h.b(String(n)) })
      const Deck = Component.define({
        name: "Deck",
        lifetime: "model",
        props: Schema.Struct({ shown: Schema.Boolean }),
        model: Schema.Null,
        message: CounterMsg,
        receives: ["Inc"],
        elements: Html
      }).make({
        children: { counter: Counter },
        init: () => null,
        update: (m, _, $) => $.set(m).send(Counter.ref("counter"), CounterMsg.Inc()),
        view: (_, h) => h.div(h.props.shown ? h.children.counter() : null)
      })
      const State = Schema.Literals(["card", "none", "off", "shown"])
      const PageMsg = UiSchema.TaggedEnum({ Go: { to: State }, Inc: {} })
      const makePage = (layer: Layer.Layer<never>) => {
        const Card = slowCard("Card", layer)
        return Component.define({ name: "Page", lifetime: "view", model: State, message: PageMsg, elements: Html })
          .make({
            children: {
              deck: Child.optional(Deck, { props: (state) => state === "none" ? null : { shown: state !== "off" } })
            },
            init: () => "card" as const,
            update: (state, message, $) =>
              PageMsg.match(message, {
                Go: ({ to }) => to,
                Inc: () => $.set(state).send(Deck.ref("deck"), CounterMsg.Inc())
              }),
            view: (state, h) =>
              h.main(
                Card(h, { key: "c", slots: { body: state === "card" ? h.children.deck?.() ?? null : null } }),
                h.aside(state === "off" || state === "shown" ? h.children.deck?.() ?? null : null)
              )
          })
      }
      const gate = yield* Deferred.make<void>()
      const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.empty), {})
      const app = yield* makeContainer(rendered.html)
      const root = yield* BrowserHost.mountEffect(makePage(gated(gate)), {}, app, { state: rendered.state })
      yield* tick
      root.send(PageMsg.Go({ to: "none" }))
      yield* tick
      root.send(PageMsg.Go({ to: "off" }))
      yield* tick
      root.send(PageMsg.Inc())
      yield* tick
      root.send(PageMsg.Go({ to: "shown" }))
      yield* tick
      assert.strictEqual(app.querySelector("aside b")?.textContent, "1")
      yield* Deferred.succeed(gate, undefined)
    }).pipe(Effect.scoped))

  // collectGarbage uses Node's V8 flags, unavailable on Bun and Deno.
  it.live.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "lets go of a removed waiting Card's nodes while another Layer waits",
    () =>
      Effect.gen(function*() {
        const Leaf = Component.define({
          name: "Leaf",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        })
          .make({ init: () => null, update: (m) => m, view: (_, h) => h.button("leaf") })
        const makePage = (card: Layer.Layer<never>, side: Layer.Layer<never>) => {
          const Card = slowCard("Card", card)
          const Sidebar = slowCard("Sidebar", side)
          return Component.define({
            name: "Page",
            lifetime: "view",
            model: Schema.Boolean,
            message: Schema.Boolean,
            elements: Html
          })
            .make({
              init: () => true,
              update: (_, card) => card,
              view: (card, h) =>
                h.main(
                  card ? Card(h, { key: "c", slots: { body: Leaf(h, { key: "l" }) } }) : null,
                  Sidebar(h, { key: "s", slots: { body: null } })
                )
            })
        }
        const card = yield* Deferred.make<void>()
        const side = yield* Deferred.make<void>()
        const rendered = yield* HtmlServer.renderToHtml(makePage(Layer.empty, Layer.empty), {})
        const app = yield* makeContainer(rendered.html)
        const root = yield* BrowserHost.mountEffect(makePage(gated(card), gated(side)), {}, app, {
          state: rendered.state
        })
        yield* tick
        const button = new WeakRef(app.querySelector("section button")!)
        root.send(false)
        yield* tick
        yield* collectGarbage
        assert.isUndefined(button.deref())
        yield* Deferred.succeed(side, undefined)
        yield* Deferred.succeed(card, undefined)
      }).pipe(Effect.scoped)
  )
})

describe("unlisted model children on BrowserHost", () => {
  const Row = Component.define({
    name: "Row",
    lifetime: "model",
    model: Schema.Null,
    message: Schema.Never,
    elements: Html
  })
    .make({ init: () => null, update: (m) => m, view: (_, h) => h.button("row") })

  it.live("shows a parked Frame's slot text after its only row is unlisted", () =>
    Effect.gen(function*() {
      const Frame = Component.define({
        name: "Frame",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html,
        slots: ["body"]
      }).make({ init: () => null, update: (m) => m, view: (_, h) => h.article(h.slots.body) })
      const State = Schema.Struct({ shown: Schema.Boolean, row: Schema.Boolean })
      const Page = Component.define({ name: "Page", lifetime: "view", model: State, message: State, elements: Html })
        .make({
          children: { frame: Frame, row: Child.optional(Row, { props: (s) => s.row ? {} : null }) },
          init: () => ({ shown: true, row: true }),
          update: (_, next) => next,
          view: (s, h) =>
            h.main(s.shown ? h.children.frame({ slots: { body: s.row ? h.children.row?.() ?? null : "text" } }) : null)
        })
      const app = yield* makeContainer()
      const root = yield* BrowserHost.mountEffect(Page, {}, app)
      yield* tick
      root.send({ shown: false, row: true })
      yield* tick
      root.send({ shown: false, row: false })
      yield* tick
      root.send({ shown: true, row: false })
      yield* tick
      assert.strictEqual(app.textContent, "text")
    }).pipe(Effect.scoped))

  // collectGarbage uses Node's V8 flags, unavailable on Bun and Deno.
  it.live.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "lets go of a row once it's unlisted",
    () =>
      Effect.gen(function*() {
        const Page = Component.define({
          name: "Page",
          lifetime: "view",
          model: Schema.Boolean,
          message: Schema.Boolean,
          elements: Html
        }).make({
          children: { row: Child.optional(Row, { props: (listed) => listed ? {} : null }) },
          init: () => false,
          update: (_, listed) => listed,
          view: (_, h) => h.main(h.children.row?.() ?? null)
        })
        const app = yield* makeContainer()
        const root = yield* BrowserHost.mountEffect(Page, {}, app)
        const buttons: Array<WeakRef<Element>> = []
        for (let i = 0; i < 3; i++) {
          root.send(true)
          yield* tick
          buttons.push(new WeakRef(app.querySelector("button")!))
          root.send(false)
          yield* tick
        }
        yield* collectGarbage
        assert.deepStrictEqual(buttons.map((button) => button.deref() === undefined), [true, true, true])
      }).pipe(Effect.scoped)
  )

  // collectGarbage uses Node's V8 flags, unavailable on Bun and Deno.
  it.live.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "lets go of rows unlisted from a parked Frame's slot",
    () =>
      Effect.gen(function*() {
        const Frame = Component.define({
          name: "Frame",
          lifetime: "model",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({ init: () => null, update: (m) => m, view: (_, h) => h.article(h.slots.body) })
        const keys = ["a", "b", "c"]
        const State = Schema.Struct({ shown: Schema.Boolean, rows: Schema.Boolean })
        const Page = Component.define({ name: "Page", lifetime: "view", model: State, message: State, elements: Html })
          .make({
            children: {
              frame: Frame,
              rows: Child.keyed(Row, { props: (s) => s.rows ? keys.map((key) => [key, {}] as const) : [] })
            },
            init: () => ({ shown: true, rows: true }),
            update: (_, next) => next,
            view: (s, h) =>
              h.main(
                s.shown
                  ? h.children.frame({ slots: { body: s.rows ? keys.map((key) => h.children.rows(key)) : null } })
                  : null
              )
          })
        const app = yield* makeContainer()
        const root = yield* BrowserHost.mountEffect(Page, {}, app)
        yield* tick
        const buttons = Array.from(app.querySelectorAll("button"), (button) => new WeakRef(button))
        assert.strictEqual(buttons.length, 3)
        root.send({ shown: false, rows: true })
        yield* tick
        root.send({ shown: false, rows: false })
        yield* tick
        yield* collectGarbage
        assert.deepStrictEqual(buttons.map((button) => button.deref() === undefined), [true, true, true])
      }).pipe(Effect.scoped)
  )

  // collectGarbage uses Node's V8 flags, unavailable on Bun and Deno.
  it.live.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "lets go of the props a parked row was drawn with and got after",
    () =>
      Effect.gen(function*() {
        const Item = Component.define({
          name: "Item",
          lifetime: "model",
          props: Schema.Struct({ data: Schema.Unknown }),
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => null, update: (m) => m, view: (_, h) => h.button("row") })
        const Frame = Component.define({
          name: "Frame",
          lifetime: "model",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({ init: () => null, update: (m) => m, view: (_, h) => h.article(h.slots.body) })
        const keys = ["a", "b", "c"]
        const payloads: Array<WeakRef<object>> = []
        const payload = (version: number) => {
          const data = { version }
          payloads.push(new WeakRef(data))
          return data
        }
        const State = Schema.Struct({ shown: Schema.Boolean, rows: Schema.Boolean, version: Schema.Number })
        const Page = Component.define({ name: "Page", lifetime: "view", model: State, message: State, elements: Html })
          .make({
            children: {
              frame: Frame,
              rows: Child.keyed(Item, {
                props: (s) => s.rows ? keys.map((key) => [key, { data: payload(s.version) }] as const) : []
              })
            },
            init: () => ({ shown: true, rows: true, version: 0 }),
            update: (_, next) => next,
            view: (s, h) =>
              h.main(s.shown ? h.children.frame({ slots: { body: keys.map((key) => h.children.rows(key)) } }) : null)
          })
        const app = yield* makeContainer()
        const root = yield* BrowserHost.mountEffect(Page, {}, app)
        yield* tick
        root.send({ shown: false, rows: true, version: 1 })
        yield* tick
        root.send({ shown: false, rows: false, version: 1 })
        yield* tick
        assert.isAbove(payloads.length, 0)
        yield* collectGarbage
        // Parked Frame keeps the slot content it was last drawn with, which declares each row with its props
        // then. Nothing else keeps them: not the records of where the rows were drawn, nor the rows.
        assert.deepStrictEqual(
          payloads.flatMap((ref) => ref.deref() ?? []),
          keys.map(() => ({ version: 0 }))
        )
      }).pipe(Effect.scoped)
  )
})
