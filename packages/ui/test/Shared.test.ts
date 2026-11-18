import { Component, MessageLog } from "@effect/ui"
import * as services from "@effect/ui/internal/services"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Schema } from "effect"
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
      s.givenChild(TipsProvider, "tips", "a")
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

// -- optional owners, reports and onChange ------------------------------------

const GroupMessage = Schema.TaggedUnion({ ChangedOn: { on: Schema.Boolean }, Bumped: {} })

/** An owner that is on while any reader reports `true`, and counts bumps. */
const Group = Component.define({
  name: "Group",
  model: Schema.Struct({ on: Schema.Boolean, bumps: Schema.Number }),
  message: GroupMessage,
  receives: ["Bumped"],
  shares: {
    value: (model) => ({ on: model.on, bumps: model.bumps }),
    reports: Schema.Boolean,
    onReports: (reports) => GroupMessage.make({ _tag: "ChangedOn", on: reports.includes(true) })
  }
}).make({
  init: () => ({ on: false, bumps: 0 }),
  update: (model, message) =>
    GroupMessage.match(message, {
      ChangedOn: ({ on }) => ({ ...model, on }),
      Bumped: () => ({ ...model, bumps: model.bumps + 1 })
    }),
  parts: (model) => ({ on: model.on })
})

const ReaderMessage = Schema.TaggedUnion({
  Clicked: {},
  ChangedGroup: { on: Schema.Boolean, bumps: Schema.Number }
})

/** Reports its Model, and answers what the group tells it with `answer`. */
const makeReader = (answer: (told: boolean) => boolean) =>
  Component.define({
    name: "Reader",
    model: Schema.Boolean,
    message: ReaderMessage,
    shared: {
      group: {
        owner: Group,
        report: (on) => on,
        onChange: (value) => ReaderMessage.make({ _tag: "ChangedGroup", ...value })
      }
    }
  }).make({
    init: () => false,
    update: (on, message) => ReaderMessage.match(message, { Clicked: () => !on, ChangedGroup: ({ on }) => answer(on) }),
    view: (_, h) => h.el("button").on("click", ReaderMessage.make({ _tag: "Clicked" })).children("reader")
  })

const GroupRef = Group.ref("Group")
const PageMessage = Schema.TaggedUnion({ Bump: { times: Schema.Number } })
const makePage = (Reader: ReturnType<typeof makeReader>) =>
  Component.define({ name: "Page", model: Schema.Null, message: PageMessage }).make({
    init: () => null,
    update: (model, { times }, $) => {
      let next = $.set(model)
      for (let i = 0; i < times; i++) next = next.send(GroupRef, { _tag: "Bumped" })
      return next
    },
    view: (_, h) => Group(h, { ref: GroupRef, fallback: () => h.text("looped"), view: () => Reader(h, { key: "r" }) })
  })

const group = "/Page/Group[Group]"
const reader = group + "/Reader[r]"

describe("optional owners, reports and onChange", () => {
  it.effect("an optional reader with no owner reads undefined, and its send to the owner is dropped", () =>
    provideHost(Effect.gen(function*() {
      const Lone = Component.define({
        name: "Lone",
        model: Schema.Null,
        message: TipMessage,
        shared: { provider: { owner: TipsProvider, optional: true } }
      }).make({
        init: () => null,
        update: (model, message, $) => $.set(model).send(TipsProvider, message),
        view: (_, h) =>
          h.el("button").on("click", TipMessage.make({ _tag: "Enter", id: "a" })).children(
            h.shared.provider === undefined ? "alone" : "grouped"
          )
      })
      const root = yield* TestHost.mount(Lone, {})
      yield* TestHost.settle
      click(root, "alone")
      yield* TestHost.settle
      const dropped = root.log().filter((entry): entry is MessageLog.SendDropped => entry._tag === "SendDropped")
      assert.deepStrictEqual(dropped.map((entry) => [entry.ref, entry.reason]), [["TipsProvider", "absent"]])
    })))

  it.effect("an owner reads its readers' reports once the pass settles: a swap in one render sends nothing, an unmount does", () =>
    provideHost(Effect.gen(function*() {
      const Toggle = Component.define({
        name: "Toggle",
        props: Schema.Struct({ open: Schema.Boolean }),
        model: Schema.Null,
        message: Schema.Never,
        shared: { group: { owner: Group, report: (_, props) => props.open } }
      }).make({ init: () => null, update: (model) => model, view: (_, h) => h.text("") })
      const Open = Schema.TaggedUnion({ Open: { which: Schema.String } })
      const Bar = Component.define({ name: "Bar", model: Schema.String, message: Open }).make({
        init: () => "a",
        update: (_, { which }) => which,
        view: (open, h) =>
          Group(h, {
            key: "g",
            view: () =>
              // `gone` unmounts the open "b", and its report goes with it.
              h.el(
                "div",
                (open === "gone" ? ["a"] : ["a", "b"]).map((key) => Toggle(h, { key, props: { open: open === key } }))
              )
          })
      })
      const root = yield* TestHost.mount(Bar, {})
      yield* TestHost.settle
      root.send(Open.make({ _tag: "Open", which: "b" }))
      yield* TestHost.settle
      root.send(Open.make({ _tag: "Open", which: "gone" }))
      yield* TestHost.settle
      const updates = updatesAt(root.log(), "/Bar/Group[g]")
      assert.deepStrictEqual(updates.map((entry) => [entry.message, entry.source]), [
        [{ _tag: "ChangedOn", on: true }, { _tag: "Reported" }],
        [{ _tag: "ChangedOn", on: false }, { _tag: "Reported" }]
      ])
    })))

  it.effect("a reader's onChange gets the new value, pointing at the owner's entry that changed it", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(makePage(makeReader((told) => told)), {})
      yield* TestHost.settle
      Locator.fire(root.get(Locator.text("reader")), "click")
      yield* TestHost.settle
      const [changed] = updatesAt(root.log(), group)
      assert.deepStrictEqual(updatesAt(root.log(), reader).map((entry) => [entry.message, entry.source]), [
        [{ _tag: "Clicked" }, { _tag: "DomEvent", name: "click" }],
        [{ _tag: "ChangedGroup", on: true, bumps: 0 }, { _tag: "Shared", name: "group", path: group, seq: changed.seq }]
      ])
      assert.deepStrictEqual(updatesAt(root.log(), group).map((entry) => entry.message), [
        { _tag: "ChangedOn", on: true }
      ])
    })))

  it.effect("a report and a shared value that answer each other fail the owner", () =>
    provideHost(Effect.gen(function*() {
      // Reports the opposite of what it's told, so equality never stops the pair.
      const root = yield* TestHost.mount(makePage(makeReader((told) => !told)), {})
      yield* TestHost.settle
      Locator.fire(root.get(Locator.text("reader")), "click")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "looped")
      const failed = root.log().filter((entry): entry is MessageLog.Failed => entry._tag === "Failed")
      assert.deepStrictEqual(failed.map((entry) => [entry.path, entry.in]), [[group, "shares"]])
      assert.include(Cause.pretty(failed[0].cause), "100 times in one flush")
    })))

  it.effect("150 changes before a render are one onChange message with the last value", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(makePage(makeReader((told) => told)), {})
      yield* TestHost.settle
      root.send(PageMessage.make({ _tag: "Bump", times: 150 }))
      yield* TestHost.settle
      assert.lengthOf(updatesAt(root.log(), group), 150)
      assert.deepStrictEqual(updatesAt(root.log(), reader).map((entry) => entry.message), [
        { _tag: "ChangedGroup", on: false, bumps: 150 }
      ])
    })))
})

describe("optional owners, reports and onChange in a Story", () => {
  const OptionalReader = Component.define({
    name: "OptionalReader",
    model: Schema.Boolean,
    message: ReaderMessage,
    shared: {
      group: {
        owner: Group,
        optional: true,
        report: (on) => on,
        onChange: (value) => ReaderMessage.make({ _tag: "ChangedGroup", ...value })
      }
    }
  }).make({
    init: () => false,
    update: (on, message, $) =>
      ReaderMessage.match(message, {
        Clicked: () => $.set(!on).send(Group, { _tag: "Bumped" }),
        ChangedGroup: ({ on }) => on
      }),
    view: (_, h) =>
      h.el("button").on("click", ReaderMessage.make({ _tag: "Clicked" })).children(
        h.shared.group === undefined ? "alone" : `bumps ${h.shared.group.bumps}`
      )
  })

  it.effect("an optional owner is absent until given: no report, and a send to it is dropped", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(OptionalReader, {})
      assert.strictEqual(Locator.textOf(s.root), "alone")
      s.click("alone")
      assert.deepStrictEqual(s.current.sent, [])
      assert.deepStrictEqual(s.current.reports, {})
    }))

  it.effect("a shared step sends onChange when it changes a value the story had, and not for the first one", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(OptionalReader, {})
      // The first value of an optional owner: the reader mounted with it, so nothing is sent.
      s.shared(Group, { on: true, bumps: 0 })
      assert.strictEqual(s.model, false)
      assert.deepStrictEqual(s.current.reports, { group: false })
      s.shared(Group, { on: true, bumps: 1 })
      assert.strictEqual(s.model, true)
      // An equal value sends nothing.
      s.send(ReaderMessage.make({ _tag: "ChangedGroup", on: false, bumps: 1 }))
      s.shared(Group, { on: true, bumps: 1 })
      assert.strictEqual(s.model, false)
      // `given` supplies a value without sending.
      s.given(false, {}, [[Group, { on: true, bumps: 2 }]])
      assert.strictEqual(s.model, false)
    }))

  it.effect("reported sends the owner's onReports message when it differs from the last", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Group, {}, { view: (parts, h) => h.el("p", parts.on ? "on" : "off") })
      // The same message as for no reports.
      s.reported([false, false])
      assert.strictEqual(Locator.textOf(s.root), "off")
      s.reported([false, true])
      assert.strictEqual(Locator.textOf(s.root), "on")
    }))
})
