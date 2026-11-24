import { Component, MessageLog, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Schema } from "effect"
import { defect } from "./utils/scoped.ts"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.scoped, Effect.provide(TestHost.layer()))
const click = (
  root: TestHost.TestRoot<unknown, never, unknown>,
  text: string
) => Locator.fire(root.get(Locator.text(text, { exact: true })), "click")
const updatesAt = (log: ReadonlyArray<MessageLog.Entry>, path: string) =>
  log.filter((entry): entry is MessageLog.Update =>
    entry._tag === "Update" && entry.path === path
  )

const TipMessage = UiSchema.TaggedEnum({ Enter: { id: Schema.String } })

/** An owner: which tip is open. Its `label` prop is shared too. */
const TipsProvider = Component.define({
  name: "TipsProvider",
  props: Schema.Struct({ label: Schema.optional(Schema.String) }),
  model: Schema.NullOr(Schema.String),
  message: TipMessage,
  shares: {
    value: (open, props) => ({ open, label: props.label ?? "" }),
    receives: ["Enter"]
  }
}).make({
  init: () => null,
  update: (_, message) => message.id,
  parts: () => ({})
})

/** A reader that opens its tip on click. */
const Tip = Component.define({
  name: "Tip",
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Null,
  message: TipMessage,
  shared: { provider: TipsProvider }
}).make({
  init: () => null,
  update: ($, message) => $.send(TipsProvider, message),
  view: (h) =>
    h.el("button").on("click", TipMessage.Enter({ id: h.props.id })).children(
      `${h.props.id}:${
        h.shared.provider.open === h.props.id ? "open" : "closed"
      }${h.shared.provider.label}`
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
    update: ($) => $.model,
    parts: (p) => ({
      open: p.shared.provider.open,
      label: p.shared.provider.label
    })
  })

/** TipsProvider with a Tip and a Trigger in its closure. Its Model is the label it passes to TipsProvider. */
const App = Component.define({
  name: "App",
  model: Schema.String,
  message: UiSchema.TaggedEnum({ Label: { label: Schema.String } })
}).make({
  init: () => "",
  update: (_, message) => message.label,
  view: (h, label) =>
    TipsProvider(h, {
      key: "tips",
      props: { label },
      view: () =>
        h.el("div", [
          Tip(h, { key: "a", props: { id: "a" } }),
          Trigger(h, {
            key: "t",
            view: (trigger) => h.el("i", trigger.open ?? "")
          })
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
      assert.deepStrictEqual(received.source, {
        _tag: "Send",
        path: "/App/TipsProvider[tips]/Tip[a]",
        seq: sent.seq
      })
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
      const Tick = UiSchema.TaggedEnum({ Tick: {} })
      const ClockProvider = Component.define({
        name: "ClockProvider",
        model: Schema.Number,
        message: Tick,
        shares: {
          value: (ticks) => new Date(Math.floor(ticks / 2)),
          receives: ["Tick"]
        }
      }).make({ init: () => 0, update: ($) => $.model + 1, parts: () => ({}) })
      let renders = 0
      const Face = Component.define({
        name: "Face",
        model: Schema.Null,
        message: Tick,
        shared: { provider: ClockProvider }
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => {
            renders++
            return h.el("p", String(h.shared.provider.getTime()))
          }
        })
      const Ticker = Component.define({
        name: "Ticker",
        model: Schema.Null,
        message: Tick
      }).make({
        init: () => null,
        update: ($, message) => $.send(ClockProvider, message),
        view: (h) => h.el("button").on("click", Tick.Tick()).children("tick")
      })
      const Host = Component.define({
        name: "Host",
        model: Schema.Null,
        message: Tick
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          ClockProvider(h, {
            key: "clock",
            view: () =>
              h.el("div", [
                Face(h, { key: "face" }),
                Ticker(h, { key: "tick" })
              ])
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
      }).make({ init: () => null, update: ($) => $.model, parts: () => ({}) })
      const Host = Component.define({
        name: "Host",
        model: Schema.Null,
        message: TipMessage
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          BrokenProvider(h, {
            key: "b",
            view: () => h.el("p", "inside"),
            fallback: () => h.el("p", "broken")
          })
      })
      const root = yield* TestHost.mount(Host, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "broken")
      const failed = root.log().filter((entry): entry is MessageLog.Failed =>
        entry._tag === "Failed"
      )
      assert.deepStrictEqual(failed.map((entry) => entry.in), ["shares"])
    })))
})

describe("shared state in a Scene", () => {
  it.effect("gives a reader the default of an owner whose props are optional, and keeps its sends in sent", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Tip, { id: "a" })
      s.click("a:closed")
      assert.deepStrictEqual(
        s.current.sent.map((
          send
        ) => [send.owner.definition.name, send.message]),
        [
          ["TipsProvider", { _tag: "Enter", id: "a" }]
        ]
      )
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
      const Frame = Component.define({
        name: "Frame",
        model: Schema.Null,
        message: TipMessage,
        slots: ["body"]
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          TipsProvider(h, {
            key: "tips",
            props: { label: "placed" },
            view: () => h.slots.body
          })
      })
      const s = yield* Scene.make(Frame, {}, {
        slots: (h) => ({
          body: Trigger(h, {
            key: "t",
            view: (trigger) => h.el("i", trigger.label)
          })
        })
      })
      assert.strictEqual(Locator.textOf(s.root), "placed")
    }))

  it("gives the parts of a headless reader the shared value, from an owner declared with p.child too", () => {
    assert.deepStrictEqual(Story.parts(Trigger, { model: null, props: {} }), {
      open: null,
      label: ""
    })
    const Tagged = Component.define({
      name: "Tagged",
      model: Schema.Null,
      message: TipMessage
    }).make({
      init: () => null,
      update: ($) => $.model,
      parts: (p) =>
        p.child(TipsProvider, {
          props: { label: "inside" },
          parts: () => p.child(Trigger, { parts: (trigger) => trigger })
        })
    })
    assert.strictEqual(
      Story.parts(Tagged, { model: null, props: {} }).label,
      "inside"
    )
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
          }).make({
            init: ($) => $.props.value,
            update: ($) => $.model,
            parts: () => ({})
          })
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
            update: ($) => $.model,
            view: (h) => h.el("p", String(h.shared.a + h.shared.b))
          })
        const shared = yield* Scene.make(Sum, {})
        assert.strictEqual(
          Locator.textOf(shared.shared(AProvider, 1).shared(BProvider, 2).root),
          "3"
        )
        const given = yield* Scene.make(Sum, {})
        assert.strictEqual(
          Locator.textOf(
            given.given(null, {}, [[AProvider, 1], [BProvider, 2]]).root
          ),
          "3"
        )
        const message = yield* defect(Effect.gen(function*() {
          const s = yield* Scene.make(Sum, {})
          s.shared(AProvider, 1)
        }))
        assert.match(message, /\.shared\(BProvider, value\)/)
      })
  )
})

// -- optional owners, reports and onChange ------------------------------------

const GroupMessage = UiSchema.TaggedEnum({
  ChangedOn: { on: Schema.Boolean },
  Bumped: {}
})

/** An owner that is on while any reader reports `true`, and counts bumps. */
const Group = Component.define({
  name: "Group",
  model: Schema.Struct({ on: Schema.Boolean, bumps: Schema.Number }),
  message: GroupMessage,
  shares: {
    value: (model) => ({ on: model.on, bumps: model.bumps }),
    receives: ["Bumped"],
    collects: {
      schema: Schema.Boolean,
      onChange: (collected) =>
        GroupMessage.ChangedOn({ on: collected.includes(true) })
    }
  }
}).make({
  init: () => ({ on: false, bumps: 0 }),
  update: ($, message) =>
    GroupMessage.match(message, {
      ChangedOn: ({ on }) => ({ ...$.model, on }),
      Bumped: () => ({ ...$.model, bumps: $.model.bumps + 1 })
    }),
  parts: (_, model) => ({ on: model.on })
})

const ReaderMessage = UiSchema.TaggedEnum({
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
        onChange: (value) => ReaderMessage.ChangedGroup({ ...value })
      }
    }
  }).make({
    init: () => false,
    update: ($, message) =>
      ReaderMessage.match(message, {
        Clicked: () => !$.model,
        ChangedGroup: ({ on }) => answer(on)
      }),
    view: (h) =>
      h.el("button").on("click", ReaderMessage.Clicked()).children("reader")
  })

const BumperMessage = UiSchema.TaggedEnum({ Bump: { times: Schema.Number } })

const Bumper = Component.define({
  name: "Bumper",
  props: Schema.Struct({ times: Schema.Number }),
  model: Schema.Null,
  message: BumperMessage,
  shared: { group: Group }
}).make({
  init: () => null,
  update: ($, { times }) => {
    let next = $.send(Group, { _tag: "Bumped" })
    for (let i = 1; i < times; i++) next = next.send(Group, { _tag: "Bumped" })
    return next
  },
  view: (h) =>
    h.el("button").on("click", BumperMessage.Bump({ times: h.props.times }))
      .children("bump")
})

const makePage = (Reader: ReturnType<typeof makeReader>) =>
  Component.define({
    name: "Page",
    model: Schema.Null,
    message: Schema.Never
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
      Group(h, {
        key: "g",
        fallback: () => h.text("looped"),
        view: () =>
          h.el(
            "div",
            Bumper(h, { key: "b", props: { times: 150 } }),
            Reader(h, { key: "r" })
          )
      })
  })

const group = "/Page/Group[g]"
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
        update: ($, message) => $.send(TipsProvider, message),
        view: (h) =>
          h.el("button").on("click", TipMessage.Enter({ id: "a" })).children(
            h.shared.provider === undefined ? "alone" : "grouped"
          )
      })
      const root = yield* TestHost.mount(Lone, {})
      yield* TestHost.settle
      click(root, "alone")
      yield* TestHost.settle
      const dropped = root.log().filter((
        entry
      ): entry is MessageLog.SendDropped => entry._tag === "SendDropped")
      assert.deepStrictEqual(dropped.map((entry) => entry.owner), [
        "TipsProvider"
      ])
    })))

  it.effect("an owner reads its readers' reports once the pass settles: a swap in one render sends nothing, an unmount does", () =>
    provideHost(Effect.gen(function*() {
      const Toggle = Component.define({
        name: "Toggle",
        props: Schema.Struct({ open: Schema.Boolean }),
        model: Schema.Null,
        message: Schema.Never,
        shared: { group: { owner: Group, report: (_, props) => props.open } }
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.text("")
      })
      const Open = UiSchema.TaggedEnum({ Open: { which: Schema.String } })
      const Bar = Component.define({
        name: "Bar",
        model: Schema.String,
        message: Open
      }).make({
        init: () => "a",
        update: (_, { which }) => which,
        view: (h, open) =>
          Group(h, {
            key: "g",
            view: () =>
              // `gone` unmounts the open "b", and its report goes with it.
              h.el(
                "div",
                (open === "gone" ? ["a"] : ["a", "b"]).map((key) =>
                  Toggle(h, { key, props: { open: open === key } })
                )
              )
          })
      })
      const root = yield* TestHost.mount(Bar, {})
      yield* TestHost.settle
      root.send(Open.Open({ which: "b" }))
      yield* TestHost.settle
      root.send(Open.Open({ which: "gone" }))
      yield* TestHost.settle
      const updates = updatesAt(root.log(), "/Bar/Group[g]")
      assert.deepStrictEqual(
        updates.map((entry) => [entry.message, entry.source]),
        [
          [{ _tag: "ChangedOn", on: true }, { _tag: "Collected" }],
          [{ _tag: "ChangedOn", on: false }, { _tag: "Collected" }]
        ]
      )
    })))

  it.effect("a report's id is the reader's own, in an app and in a Scene", () =>
    provideHost(Effect.gen(function*() {
      const IdsMessage = UiSchema.TaggedEnum({
        ChangedIds: { ids: Schema.Array(Schema.String) }
      })
      const Controls = Component.define({
        name: "Controls",
        model: Schema.Array(Schema.String),
        message: IdsMessage,
        shares: {
          value: () => null,
          collects: {
            schema: Schema.String,
            onChange: (ids) => IdsMessage.ChangedIds({ ids: [...ids].sort() })
          }
        }
      }).make({
        init: () => [],
        update: (_, { ids }) => ids,
        parts: (_, ids) => ({ ids })
      })
      const Box = Component.define({
        name: "Box",
        model: Schema.Null,
        message: Schema.Never,
        shared: {
          controls: { owner: Controls, report: (_, __, id) => id("box") }
        }
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.el("span").attr("id", h.id("box"))
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          Controls(h, {
            key: "c",
            view: (controls) =>
              h.el(
                "div",
                h.el("p", controls.ids.join(" ")),
                Box(h, { key: "a" }),
                Box(h, { key: "b" })
              )
          })
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      const rendered = root.all(Locator.tag("span")).map((span) =>
        span.attrs?.id
      ).sort()
      assert.lengthOf(rendered, 2)
      assert.strictEqual(
        Locator.textOf(root.get(Locator.tag("p"))),
        rendered.join(" ")
      )

      const box = yield* Scene.make(Box, {})
      box.shared(Controls, null)
      assert.deepStrictEqual(box.current.reports, {
        controls: box.get(Locator.tag("span")).attrs?.id
      })
    })))

  it.effect("a reader's onChange gets the new value, pointing at the owner's entry that changed it", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(
        makePage(makeReader((told) => told)),
        {}
      )
      yield* TestHost.settle
      click(root, "reader")
      yield* TestHost.settle
      const [changed] = updatesAt(root.log(), group)
      assert.deepStrictEqual(
        updatesAt(root.log(), reader).map((
          entry
        ) => [entry.message, entry.source]),
        [
          [{ _tag: "Clicked" }, { _tag: "DomEvent", name: "click" }],
          [{ _tag: "ChangedGroup", on: true, bumps: 0 }, {
            _tag: "Shared",
            name: "group",
            path: group,
            seq: changed.seq
          }]
        ]
      )
      assert.deepStrictEqual(
        updatesAt(root.log(), group).map((entry) => entry.message),
        [
          { _tag: "ChangedOn", on: true }
        ]
      )
      const [clicked, told] = updatesAt(root.log(), reader)
      assert.strictEqual(clicked.causedBy, undefined)
      assert.strictEqual(changed.causedBy, clicked.seq)
      assert.strictEqual(told.causedBy, clicked.seq)
    })))

  it.effect("a report and a shared value that answer each other fail the owner", () =>
    provideHost(Effect.gen(function*() {
      // Reports the opposite of what it's told, so equality never stops the pair.
      const root = yield* TestHost.mount(
        makePage(makeReader((told) => !told)),
        {}
      )
      yield* TestHost.settle
      click(root, "reader")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "looped")
      const failed = root.log().filter((entry): entry is MessageLog.Failed =>
        entry._tag === "Failed"
      )
      assert.deepStrictEqual(failed.map((entry) => [entry.path, entry.in]), [[
        group,
        "shares"
      ]])
      assert.include(Cause.pretty(failed[0].cause), "100 times in one flush")
    })))

  it.effect("150 changes before a render are one onChange message with the last value", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(
        makePage(makeReader((told) => told)),
        {}
      )
      yield* TestHost.settle
      click(root, "bump")
      yield* TestHost.settle
      assert.lengthOf(updatesAt(root.log(), group), 150)
      assert.deepStrictEqual(
        updatesAt(root.log(), reader).map((entry) => entry.message),
        [
          { _tag: "ChangedGroup", on: false, bumps: 150 }
        ]
      )
    })))
})

describe("shared state in update", () => {
  const ClockMessage = UiSchema.TaggedEnum({ Ticked: {} })
  const Clock = Component.define({
    name: "Clock",
    model: Schema.Number,
    message: ClockMessage,
    shares: {
      value: (ticks) => ({ at: new Date(ticks), "~redacted": false }),
      receives: ["Ticked"],
      schema: Schema.Struct({ at: Schema.Date, "~redacted": Schema.Boolean })
    }
  }).make({ init: () => 0, update: ($) => $.model + 1, parts: () => ({}) })
  const WatchMessage = UiSchema.TaggedEnum({ Clicked: {} })
  const Watch = Component.define({
    name: "Watch",
    model: Schema.Array(Schema.Number),
    message: WatchMessage,
    shared: { clock: Clock, tips: { owner: TipsProvider, optional: true } }
  }).make({
    init: () => [],
    update: ($) =>
      $.set([
        ...$.model,
        Object.hasOwn($.shared, "tips") && $.shared.tips === undefined
          ? $.shared.clock.at.getTime()
          : -1
      ])
        .send(Clock, ClockMessage.Ticked()),
    view: (h, seen) =>
      h.el("button").on("click", WatchMessage.Clicked()).children(
        `saw [${seen.join(",")}]`
      )
  })
  const Ticker = Component.define({
    name: "Ticker",
    model: Schema.Null,
    message: ClockMessage,
    shared: { clock: Clock }
  }).make({
    init: () => null,
    update: ($, message) => $.send(Clock, message),
    view: (h) =>
      h.el("button").on("click", ClockMessage.Ticked()).children("tick")
  })
  const Face = Component.define({
    name: "Face",
    model: Schema.Null,
    message: Schema.Never
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
      Clock(h, {
        key: "clock",
        view: () => h.el("div", Watch(h, { key: "w" }), Ticker(h, { key: "t" }))
      })
  })

  it.effect("reads the owner's value as update runs, logs it, and replays it from entries and Wire frames", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Face, {})
      yield* TestHost.settle
      click(root, "saw []")
      yield* TestHost.settle
      click(root, "tick")
      click(root, "saw [0]")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "saw [0,2]tick")
      const log = root.log()
      assert.deepStrictEqual(
        updatesAt(log, "/Face/Clock[clock]/Watch[w]").map((entry) =>
          entry.shared
        ),
        [
          { clock: { at: new Date(0), "~redacted": false }, tips: undefined },
          { clock: { at: new Date(2), "~redacted": false }, tips: undefined }
        ]
      )
      for (
        const replay of [
          Story.fromLog(Watch, log),
          Story.fromLog(Watch, log.map(MessageLog.makeEncoder().encode))
        ]
      ) {
        assert.isUndefined(replay.divergence)
        assert.deepStrictEqual(replay.model, [0, 2])
      }
      assert.throws(
        () =>
          Story.fromLog(
            Watch,
            log.map(MessageLog.makeEncoder({ maxEntryBytes: 30 }).encode)
          ),
        /entry #\d+ \(\/Face\/Clock\[clock\]\/Watch\[w\]\) has a shared value .* ~truncated placeholder/
      )
    })))

  it("throws for an update called with no shared values only when it reads one", () => {
    assert.isTrue(
      makeReader(() => false).update(false, ReaderMessage.Clicked(), {}).model
    )
    assert.throws(
      () => Watch.update([], WatchMessage.Clicked(), {}),
      /render it below a Clock/
    )
  })
})

describe("onChange rounds and declarations", () => {
  it.effect("a reader that changes the owner mid-round leaves the next reader's message pointing at its value's entry", () =>
    provideHost(Effect.gen(function*() {
      // Answers the first bump with another, inside the round that tells it.
      const Replier = Component.define({
        name: "Replier",
        model: Schema.Null,
        message: ReaderMessage,
        shared: {
          group: {
            owner: Group,
            onChange: (value) => ReaderMessage.ChangedGroup({ ...value })
          }
        }
      }).make({
        init: () => null,
        update: ($, message) =>
          message._tag === "ChangedGroup" && message.bumps === 1
            ? $.send(Group, { _tag: "Bumped" })
            : $.model,
        view: (h) => h.text("")
      })
      const Reader = makeReader((told) => told)
      const Page = Component.define({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          Group(h, {
            key: "g",
            view: () =>
              h.el(
                "div",
                Bumper(h, { key: "b", props: { times: 1 } }),
                Replier(h, { key: "a" }),
                Reader(h, { key: "r" })
              )
          })
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "bump")
      yield* TestHost.settle
      const [first, second] = updatesAt(root.log(), group)
      assert.deepStrictEqual(
        updatesAt(root.log(), reader).map((
          entry
        ) => [entry.message, entry.source]),
        [
          [{ _tag: "ChangedGroup", on: false, bumps: 1 }, {
            _tag: "Shared",
            name: "group",
            path: group,
            seq: first.seq
          }],
          [{ _tag: "ChangedGroup", on: false, bumps: 2 }, {
            _tag: "Shared",
            name: "group",
            path: group,
            seq: second.seq
          }]
        ]
      )
    })))

  it("rejects two onChange for one owner, and takes aliases with one", () => {
    const onChange = (value: { on: boolean; bumps: number }) =>
      ReaderMessage.ChangedGroup({ ...value })
    assert.throws(
      () =>
        Component.define({
          name: "Twice",
          model: Schema.Null,
          message: ReaderMessage,
          shared: {
            a: { owner: Group, onChange },
            b: { owner: Group, optional: true, onChange }
          }
        }),
      "Twice lists Group under a and b, each with an onChange"
    )
    Component.define({
      name: "Aliased",
      model: Schema.Null,
      message: ReaderMessage,
      shared: {
        a: { owner: Group, onChange },
        b: Group,
        c: { owner: Group, report: () => true }
      }
    })
  })
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
        onChange: (value) => ReaderMessage.ChangedGroup({ ...value })
      }
    }
  }).make({
    init: () => false,
    update: ($, message) =>
      ReaderMessage.match(message, {
        Clicked: () => $.set(!$.model).send(Group, { _tag: "Bumped" }),
        ChangedGroup: ({ on }) => on
      }),
    view: (h) =>
      h.el("button").on("click", ReaderMessage.Clicked()).children(
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
      s.send(ReaderMessage.ChangedGroup({ on: false, bumps: 1 }))
      s.shared(Group, { on: true, bumps: 1 })
      assert.strictEqual(s.model, false)
      // `given` supplies a value without sending.
      s.given(false, {}, [[Group, { on: true, bumps: 2 }]])
      assert.strictEqual(s.model, false)
    }))

  it.effect("collected sends the owner's collects.onChange message when it differs from the last", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Group, {}, {
        view: (group, h) => h.el("p", group.on ? "on" : "off")
      })
      // The same message as for no reports.
      s.collected([false, false])
      assert.strictEqual(Locator.textOf(s.root), "off")
      s.collected([false, true])
      assert.strictEqual(Locator.textOf(s.root), "on")
    }))
})

describe("a component that reads its own kind", () => {
  const NestMessage = UiSchema.TaggedEnum({
    ChangedBelow: { open: Schema.Number }
  })
  const Nest = Component.define({
    name: "Nest",
    props: Schema.Struct({ open: Schema.Boolean }),
    model: Schema.Number,
    message: NestMessage,
    shares: {
      value: (_, props) => ({ open: props.open }),
      collects: {
        schema: Schema.Number,
        onChange: (counts) =>
          NestMessage.ChangedBelow({
            open: counts.reduce((sum, count) => sum + count, 0)
          })
      }
    },
    shared: {
      parent: {
        owner: "self",
        optional: true,
        report: (below, props) => (props.open ? 1 + below : 0)
      }
    }
  }).make({
    init: () => 0,
    update: (_, message) =>
      NestMessage.match(message, { ChangedBelow: ({ open }) => open }),
    parts: (p, below) => ({ nested: p.shared.parent !== undefined, below })
  })
  const Toggle = UiSchema.TaggedEnum({ Toggled: {} })
  const Nests = Component.define({
    name: "Nests",
    model: Schema.Boolean,
    message: Toggle
  }).make({
    init: () => true,
    update: ($) => !$.model,
    view: (h, open) => {
      const label = (
        name: string,
        nest: { readonly nested: boolean; readonly below: number }
      ) =>
        h.el(
          "span",
          `${name} ${nest.nested ? "nested" : "outer"} ${nest.below}`
        )
      return Nest(h, {
        props: { open: true },
        view: (outerNest) =>
          h.el("div", [
            label("a", outerNest),
            Nest(h, {
              props: { open: true },
              view: (middleNest) =>
                h.el("div", [
                  label("b", middleNest),
                  Nest(h, {
                    props: { open },
                    view: (innerNest) => label("c", innerNest)
                  })
                ])
            })
          ])
      })
    }
  })

  it.effect("reads the nearest instance of its own kind above it, and reports to it", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Nests, {})
      yield* TestHost.settle
      const labels = () => root.all(Locator.tag("span")).map(Locator.textOf)
      assert.deepStrictEqual(labels(), [
        "a outer 2",
        "b nested 1",
        "c nested 0"
      ])
      root.send(Toggle.Toggled())
      yield* TestHost.settle
      assert.deepStrictEqual(labels(), [
        "a outer 1",
        "b nested 0",
        "c nested 0"
      ])
    })))

  it.effect("in a scene and a story, reads only what was given: never its own value", () =>
    Effect.gen(function*() {
      assert.deepStrictEqual(
        Story.parts(Nest, { model: 0, props: { open: true } }),
        { nested: false, below: 0 }
      )
      const scene = yield* Scene.make(Nest, { open: true }, {
        view: (nest, h) => h.el("p", nest.nested ? "nested" : "outermost")
      })
      scene.expect(Locator.text("outermost")).toExist()
      scene.shared(Nest, { open: true }).expect(Locator.text("nested"))
        .toExist()
    }).pipe(Effect.scoped))

  const MenuMessage = UiSchema.TaggedEnum({ Pick: {}, Picked: {} })
  const Menu = Component.define({
    name: "Menu",
    model: Schema.Number,
    message: MenuMessage,
    elements: Html,
    shares: { value: (picked) => picked, receives: ["Picked"] },
    shared: { parent: { owner: "self", optional: true } }
  }).make({
    init: () => 0,
    update: ($, message) =>
      MenuMessage.match(message, {
        Pick: () => $.send("self", MenuMessage.Picked()),
        Picked: () => $.send("self", MenuMessage.Picked()).set($.model + 1)
      }),
    parts: (p, picked) => ({
      picked,
      item: p.part("button", (b) => b.onClick(MenuMessage.Pick()))
    })
  })
  const Menus = Component.define({
    name: "Menus",
    model: Schema.Null,
    message: Schema.Never,
    elements: Html
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
      Menu(h, {
        key: "outer",
        view: (outer) =>
          h.div(
            outer.item(h.button.children(`outer ${outer.picked}`)),
            Menu(h, {
              key: "inner",
              view: (inner) =>
                inner.item(h.button.children(`inner ${inner.picked}`))
            })
          )
      })
  })

  it.effect("sends to the nearest instance of its own kind above it, and the outermost one's send is dropped", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Menus, {})
      yield* TestHost.settle
      Locator.fire(root.get(Locator.text("inner 0", { exact: true })), "click")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "outer 1inner 0")
      const dropped = root.log().filter((
        entry
      ): entry is MessageLog.SendDropped => entry._tag === "SendDropped")
      assert.deepStrictEqual(dropped.map((entry) => entry.owner), ["Menu"])
      const [sent] = updatesAt(root.log(), "/Menus/Menu[outer]/Menu[inner]")
      assert.strictEqual(sent.sends[0].owner, Menu)
      const [received] = updatesAt(root.log(), "/Menus/Menu[outer]")
      assert.deepStrictEqual(received.source, {
        _tag: "Send",
        path: "/Menus/Menu[outer]/Menu[inner]",
        seq: sent.seq
      })
    })))

  it("in a scene, a send to its own kind goes to the one given, and is dropped without one", () => {
    const scene = () =>
      Scene.start(Menu, {}, {
        elements: Html,
        view: (menu, h) => menu.item(h.button.children("pick"))
      })
    const alone = scene()
    alone.click("pick")
    assert.deepStrictEqual(alone.current.sent, [])
    const nested = scene().shared(Menu, 0)
    nested.click("pick")
    assert.lengthOf(nested.sent(Menu, MenuMessage.Picked()).current.sent, 0)
  })

  it("rejects a read of its own kind that isn't optional, or in a component that shares nothing", () => {
    const self = { owner: "self", optional: true } as const
    assert.throws(
      () =>
        Component.define({
          name: "Bare",
          model: Schema.Null,
          message: Schema.Never,
          shared: { parent: self } as any
        }),
      /Bare reads its own kind under parent, so it must share state: add shares/
    )
    assert.throws(
      () =>
        Component.define({
          name: "Required",
          model: Schema.Null,
          message: Schema.Never,
          shares: () => null,
          shared: { parent: { owner: "self" } } as any
        }),
      /Required reads its own kind under parent, and the outermost one has none above it: add optional: true/
    )
  })
})
