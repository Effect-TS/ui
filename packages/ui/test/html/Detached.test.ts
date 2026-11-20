// @vitest-environment happy-dom
import { Child, Component, MessageLog, UiSchema } from "@effect/ui"
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
