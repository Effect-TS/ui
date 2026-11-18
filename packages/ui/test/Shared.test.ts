import { Component, MessageLog } from "@effect/ui"
import * as services from "@effect/ui/internal/services"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { defect } from "./utils/scoped.ts"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.scoped, Effect.provide(TestHost.layer()))
const click = (root: TestHost.TestRoot<any, any, any>, text: string) =>
  Locator.fire(root.get(Locator.text(text, { exact: true })), "click")
const updatesAt = (log: ReadonlyArray<MessageLog.Entry>, path: string) =>
  log.filter((entry): entry is MessageLog.Update => entry._tag === "Update" && entry.path === path)

const TipMessage = Schema.TaggedUnion({ Enter: { id: Schema.String } })

/** An owner: which tip is open. Its `label` prop is shared too. */
const TipsProvider = Component.define({
  name: "TipsProvider",
  props: Schema.Struct({ label: Schema.optional(Schema.String) }),
  model: Schema.NullOr(Schema.String),
  message: TipMessage,
  receives: ["Enter"],
  shares: (open, props) => ({ open, label: props.label ?? "" })
}).make({ init: () => null, update: (_, message) => message.id, parts: () => ({}) })

/** A reader that opens its tip on click. */
const Tip = Component.define({
  name: "Tip",
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Null,
  message: TipMessage,
  shared: { provider: TipsProvider }
}).make({
  init: () => null,
  update: (model, message, $) => $.set(model).send(TipsProvider, message),
  view: (_, h) =>
    h.el("button").on("click", TipMessage.make({ _tag: "Enter", id: h.props.id })).children(
      `${h.props.id}:${h.shared.provider.open === h.props.id ? "open" : "closed"}${h.shared.provider.label}`
    )
})

/** A headless reader: its part is the open tip. */
const Trigger = Component.define({
  name: "Trigger",
  model: Schema.Null,
  message: TipMessage,
  shared: { provider: TipsProvider }
})
  .make({
    init: () => null,
    update: (model) => model,
    parts: (_, p) => ({ open: p.shared.provider.open, label: p.shared.provider.label })
  })

/** TipsProvider with a Tip and a Trigger in its closure. Its Model is the label it passes to TipsProvider. */
const App = Component.define({
  name: "App",
  model: Schema.String,
  message: Schema.TaggedUnion({ Label: { label: Schema.String } })
}).make({
  init: () => "",
  update: (_, message) => message.label,
  view: (label, h) =>
    TipsProvider(h, {
      key: "tips",
      props: { label },
      view: () =>
        h.el("div", [
          Tip(h, { key: "a", props: { id: "a" } }),
          Trigger(h, { key: "t", view: (parts) => h.el("i", parts.open ?? "") })
        ])
    })
})

describe("shared state", () => {
  it.effect("a reader reads its owner's value, and its send reaches the owner as a logged update", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(App, {})
      yield* TestHost.settle
      click(root, "a:closed")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "a:opena")
      const [sent] = updatesAt(root.log(), "/App/TipsProvider[tips]/Tip[a]")
      assert.deepStrictEqual(MessageLog.encodeSend(sent.sends![0]), {
        owner: "TipsProvider",
        message: { _tag: "Enter", id: "a" }
      })
      const [received] = updatesAt(root.log(), "/App/TipsProvider[tips]")
      assert.deepStrictEqual(received.source, { _tag: "Send", path: "/App/TipsProvider[tips]/Tip[a]", seq: sent.seq })
    })))

  it.effect("re-renders the readers when the owner's props change what it shares", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(App, {})
      yield* TestHost.settle
      root.send({ _tag: "Label", label: "!" })
      yield* TestHost.settle
      assert.strictEqual(root.text(), "a:closed!")
    })))

  // A Date has no keys: it must be compared by value, not as a record.
  it.effect("re-renders the readers only when the shared value changes", () =>
    provideHost(Effect.gen(function*() {
      const Tick = Schema.TaggedUnion({ Tick: {} })
      const ClockProvider = Component.define({
        name: "ClockProvider",
        model: Schema.Number,
        message: Tick,
        receives: ["Tick"],
        shares: (ticks) => new Date(Math.floor(ticks / 2))
      }).make({ init: () => 0, update: (ticks) => ticks + 1, parts: () => ({}) })
      let renders = 0
      const Face = Component.define({
        name: "Face",
        model: Schema.Null,
        message: Tick,
        shared: { provider: ClockProvider }
      })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => {
            renders++
            return h.el("p", String(h.shared.provider.getTime()))
          }
        })
      const Ticker = Component.define({ name: "Ticker", model: Schema.Null, message: Tick }).make({
        init: () => null,
        update: (model, message, $) => $.set(model).send(ClockProvider, message),
        view: (_, h) => h.el("button").on("click", Tick.make({ _tag: "Tick" })).children("tick")
      })
      const Host = Component.define({ name: "Host", model: Schema.Null, message: Tick }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) =>
          ClockProvider(h, {
            key: "clock",
            view: () => h.el("div", [Face(h, { key: "face" }), Ticker(h, { key: "tick" })])
          })
      })
      const root = yield* TestHost.mount(Host, {})
      yield* TestHost.settle
      click(root, "tick")
      yield* TestHost.settle
      assert.strictEqual(renders, 1)
      click(root, "tick")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "1tick")
    })))

  it.effect("fails an owner whose shares throws, with source shares", () =>
    provideHost(Effect.gen(function*() {
      const BrokenProvider = Component.define({
        name: "BrokenProvider",
        model: Schema.Null,
        message: TipMessage,
        shares: (): string => {
          throw new Error("boom")
        }
      }).make({ init: () => null, update: (model) => model, parts: () => ({}) })
      const Host = Component.define({ name: "Host", model: Schema.Null, message: TipMessage }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) =>
          BrokenProvider(h, { key: "b", view: () => h.el("p", "inside"), fallback: () => h.el("p", "broken") })
      })
      const root = yield* TestHost.mount(Host, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "broken")
      const failed = root.log().filter((entry): entry is MessageLog.Failed => entry._tag === "Failed")
      assert.deepStrictEqual(failed.map((entry) => entry.in), ["shares"])
    })))

  it.effect("leaves an owner out of the history snapshot and never restores it", () =>
    Effect.gen(function*() {
      let handle: services.RootHandle | undefined
      const restored: Array<string> = []
      const hooks: services.RootHooks = {
        attach: (root) => {
          handle = root
          return () => {}
        },
        afterFlush: () => {},
        restore: (path) => {
          restored.push(path)
          return undefined
        },
        declare: () => () => {}
      }
      yield* TestHost.mount(App, {}).pipe(Effect.provideService(services.RootHooks, hooks))
      yield* TestHost.settle
      const snapshot = Object.keys(handle!.snapshot())
      assert.notInclude(snapshot, "/App/TipsProvider[tips]")
      assert.include(snapshot, "/App/TipsProvider[tips]/Tip[a]")
      assert.notInclude(restored, "/App/TipsProvider[tips]")
      assert.include(restored, "/App/TipsProvider[tips]/Tip[a]")
    }).pipe(provideHost))
})

describe("shared state in a Scene", () => {
  it.effect("gives a reader the default of an owner whose props are optional, and keeps its sends in sent", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Tip, { id: "a" })
      s.click("a:closed")
      assert.deepStrictEqual(s.current.sent.map((send) => [send.owner?.definition.name, send.message]), [
        ["TipsProvider", { _tag: "Enter", id: "a" }]
      ])
      s.sent(TipsProvider, { _tag: "Enter", id: "a" })
      // The scene never runs the owner's update.
      assert.strictEqual(Locator.textOf(s.root), "a:closed")
    }))

  it.effect("reads the expanded Model of an owner in the scene's own view", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(App, {})
      s.givenChild("tips", "a")
      // Trigger is expanded; Tip is a normal child, so a slot with no text.
      assert.strictEqual(Locator.textOf(s.root), "a")
    }))

  // A scene with no steps keeps the view it expanded, where the owner placing the slot is already gone.
  it.effect("gives slot content the owner that places it", () =>
    Effect.gen(function*() {
      const Frame = Component.define({ name: "Frame", model: Schema.Null, message: TipMessage, slots: ["body"] }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => TipsProvider(h, { key: "tips", props: { label: "placed" }, view: () => h.slots.body })
      })
      const s = yield* Scene.make(Frame, {}, {
        slots: (h) => ({ body: Trigger(h, { key: "t", view: (parts) => h.el("i", parts.label) }) })
      })
      assert.strictEqual(Locator.textOf(s.root), "placed")
    }))

  it("gives the parts of a headless reader the shared value", () => {
    assert.deepStrictEqual(Story.parts(Trigger, { model: null, props: {} }), { open: null, label: "" })
  })

  it.effect(
    "takes the values of owners with required props from shared steps or given, and throws naming a missing one",
    () =>
      Effect.gen(function*() {
        const required = (name: string) =>
          Component.define({
            name,
            props: Schema.Struct({ value: Schema.Number }),
            model: Schema.Number,
            message: TipMessage,
            shares: (model) => model
          }).make({ init: ($) => $.props.value, update: (model) => model, parts: () => ({}) })
        const AProvider = required("AProvider")
        const BProvider = required("BProvider")
        const Sum = Component.define({
          name: "Sum",
          model: Schema.Null,
          message: TipMessage,
          shared: { a: AProvider, b: BProvider }
        })
          .make({
            init: () => null,
            update: (model) => model,
            view: (_, h) => h.el("p", String(h.shared.a + h.shared.b))
          })
        const shared = yield* Scene.make(Sum, {})
        assert.strictEqual(Locator.textOf(shared.shared(AProvider, 1).shared(BProvider, 2).root), "3")
        const given = yield* Scene.make(Sum, {})
        assert.strictEqual(Locator.textOf(given.given(null, {}, [[AProvider, 1], [BProvider, 2]]).root), "3")
        const message = yield* defect(Effect.gen(function*() {
          const s = yield* Scene.make(Sum, {})
          s.shared(AProvider, 1)
        }))
        assert.match(message, /\.shared\(BProvider, value\)/)
      })
  )
})
