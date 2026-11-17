import { Component, MessageLog } from "@effect/ui"
import * as services from "@effect/ui/internal/services"
import { Locator, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.scoped, Effect.provide(TestHost.layer()))
const click = (root: TestHost.TestRoot<any, any, any>, text: string) =>
  Locator.fire(root.get(Locator.text(text, { exact: true })), "click")
const updatesAt = (log: ReadonlyArray<MessageLog.Entry>, path: string) =>
  log.filter((entry): entry is MessageLog.Update => entry._tag === "Update" && entry.path === path)

const TipMessage = Schema.TaggedUnion({ Enter: { id: Schema.String } })

/** An owner: which tip is open. Its `label` prop is shared too. */
const Tips = Component.define({
  name: "Tips",
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
  shared: { tips: Tips }
}).make({
  init: () => null,
  update: (model, message, $) => $.set(model).send(Tips, message),
  view: (_, h) =>
    h.el("button").on("click", TipMessage.make({ _tag: "Enter", id: h.props.id })).children(
      `${h.props.id}:${h.shared.tips.open === h.props.id ? "open" : "closed"}${h.shared.tips.label}`
    )
})

/** A headless reader: its part is the open tip. */
const Trigger = Component.define({ name: "Trigger", model: Schema.Null, message: TipMessage, shared: { tips: Tips } })
  .make({
    init: () => null,
    update: (model) => model,
    parts: (_, p) => ({ open: p.shared.tips.open, label: p.shared.tips.label })
  })

/** Tips with a Tip and a Trigger in its closure. Its Model is the label it passes to Tips. */
const App = Component.define({
  name: "App",
  model: Schema.String,
  message: Schema.TaggedUnion({ Label: { label: Schema.String } })
}).make({
  init: () => "",
  update: (_, message) => message.label,
  view: (label, h) =>
    Tips(h, {
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
      const [sent] = updatesAt(root.log(), "/App/Tips[tips]/Tip[a]")
      assert.deepStrictEqual(MessageLog.encodeSend(sent.sends![0]), {
        owner: "Tips",
        message: { _tag: "Enter", id: "a" }
      })
      const [received] = updatesAt(root.log(), "/App/Tips[tips]")
      assert.deepStrictEqual(received.source, { _tag: "Send", path: "/App/Tips[tips]/Tip[a]", seq: sent.seq })
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
      const Clock = Component.define({
        name: "Clock",
        model: Schema.Number,
        message: Tick,
        receives: ["Tick"],
        shares: (ticks) => new Date(Math.floor(ticks / 2))
      }).make({ init: () => 0, update: (ticks) => ticks + 1, parts: () => ({}) })
      let renders = 0
      const Face = Component.define({ name: "Face", model: Schema.Null, message: Tick, shared: { clock: Clock } })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => {
            renders++
            return h.el("p", String(h.shared.clock.getTime()))
          }
        })
      const Ticker = Component.define({ name: "Ticker", model: Schema.Null, message: Tick }).make({
        init: () => null,
        update: (model, message, $) => $.set(model).send(Clock, message),
        view: (_, h) => h.el("button").on("click", Tick.make({ _tag: "Tick" })).children("tick")
      })
      const Host = Component.define({ name: "Host", model: Schema.Null, message: Tick }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) =>
          Clock(h, { key: "clock", view: () => h.el("div", [Face(h, { key: "face" }), Ticker(h, { key: "tick" })]) })
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
      const Broken = Component.define({
        name: "Broken",
        model: Schema.Null,
        message: TipMessage,
        shares: (): string => {
          throw new Error("boom")
        }
      }).make({ init: () => null, update: (model) => model, parts: () => ({}) })
      const Host = Component.define({ name: "Host", model: Schema.Null, message: TipMessage }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => Broken(h, { key: "b", view: () => h.el("p", "inside"), fallback: () => h.el("p", "broken") })
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
      assert.notInclude(snapshot, "/App/Tips[tips]")
      assert.include(snapshot, "/App/Tips[tips]/Tip[a]")
      assert.notInclude(restored, "/App/Tips[tips]")
      assert.include(restored, "/App/Tips[tips]/Tip[a]")
    }).pipe(provideHost))
})

describe("shared state in a Story", () => {
  it("gives a reader the default of an owner whose props are optional, and keeps its sends in sent", () => {
    const story = Story.make(Tip, { id: "a" }, (s) => s.click("a:closed"))
    assert.deepStrictEqual(story.sent.map((send) => [send.owner?.definition.name, send.message]), [
      ["Tips", { _tag: "Enter", id: "a" }]
    ])
    // The story never runs the owner's update.
    assert.strictEqual(Locator.textOf(story.root), "a:closed")
  })

  it("reads the expanded Model of an owner in the story's own view", () => {
    const story = Story.make(App, {}, (s) => s.givenChild("tips", "a"))
    // Trigger is expanded; Tip is a normal child, so a slot with no text.
    assert.strictEqual(Locator.textOf(story.root), "a")
  })

  // A story with no steps keeps the view it expanded, where the owner placing the slot is already gone.
  it("gives slot content the owner that places it", () => {
    const Frame = Component.define({ name: "Frame", model: Schema.Null, message: TipMessage, slots: ["body"] }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => Tips(h, { key: "tips", props: { label: "placed" }, view: () => h.slots.body })
    })
    const story = Story.make(Frame, {}, {
      slots: (h) => ({ body: Trigger(h, { key: "t", view: (parts) => h.el("i", parts.label) }) })
    }, () => {})
    assert.strictEqual(Locator.textOf(story.root), "placed")
  })

  it("gives the parts of a headless reader the shared value", () => {
    assert.deepStrictEqual(Story.parts(Trigger, { model: null, props: {} }), { open: null, label: "" })
  })

  it("takes the values of owners with required props from shared steps or given, and throws naming a missing one", () => {
    const required = (name: string) =>
      Component.define({
        name,
        props: Schema.Struct({ value: Schema.Number }),
        model: Schema.Number,
        message: TipMessage,
        shares: (model) => model
      }).make({ init: ($) => $.props.value, update: (model) => model, parts: () => ({}) })
    const A = required("A")
    const B = required("B")
    const Sum = Component.define({ name: "Sum", model: Schema.Null, message: TipMessage, shared: { a: A, b: B } })
      .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("p", String(h.shared.a + h.shared.b)) })
    assert.strictEqual(Locator.textOf(Story.make(Sum, {}, (s) => s.shared(A, 1).shared(B, 2)).root), "3")
    assert.strictEqual(Locator.textOf(Story.make(Sum, {}, (s) => s.given(null, {}, [[A, 1], [B, 2]])).root), "3")
    assert.throws(() => Story.make(Sum, {}, (s) => s.shared(A, 1)), /\.shared\(B, value\)/)
  })
})
