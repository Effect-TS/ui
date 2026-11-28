import { Component, MessageLog, UiSchema } from "@effect/ui"
import { Locator, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(TestHost.layer()))

const LogMessage = UiSchema.TaggedEnum({ Add: { id: Schema.String } })

const Log = Component.define({
  name: "Log",
  model: Schema.Array(Schema.String),
  message: LogMessage,
  shares: { value: ({ model: ids }) => ids, receives: ["Add"] }
}).make({
  init: () => [],
  update: ($, { id }) => [...$.model, id],
  parts: () => ({})
})

const ItemMessage = UiSchema.TaggedEnum({
  Adds: { ids: Schema.NonEmptyArray(Schema.String) }
})

const ItemDef = Component.define({
  name: "Item",
  model: Schema.Number,
  message: ItemMessage,
  reads: { log: Log }
})

const itemView = ItemDef.view((h) =>
  h.el("button").on("click", ItemMessage.Adds({ ids: ["b", "a", "b"] }))
    .children(`log:${h.reads.log.join(",")}`)
)

const Item = ItemDef.make({
  init: () => 0,
  update: ($, { ids: [first, ...rest] }) =>
    rest.reduce(
      (step, id) => step.send(Log, LogMessage.Add({ id })),
      $.set($.model + 1 + rest.length).send(Log, LogMessage.Add({ id: first }))
    ),
  view: itemView
})

const Page = Component.define({
  name: "Page",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => Log(h, { key: "log", view: () => Item(h, { key: "i" }) })
})

const updates = (log: ReadonlyArray<MessageLog.Entry>, path: string) =>
  log.filter((entry): entry is MessageLog.Update =>
    entry._tag === "Update" && entry.path === path
  )

const mountAndClick = Effect.gen(function*() {
  const root = yield* TestHost.mount(Page, {})
  yield* TestHost.settle
  Locator.fire(root.get(Locator.text("log:", { exact: true })), "click")
  yield* TestHost.settle
  return root
})

describe("$.send to an owner", () => {
  it.effect("delivers several sends in the order they were issued, each logged as a Send", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* mountAndClick
      assert.strictEqual(root.text(), "log:b,a,b")
      const [sent] = updates(root.log(), "/Page/Log[log]/Item[i]")
      assert.deepStrictEqual(sent.sends?.map(MessageLog.encodeSend), [
        { owner: "Log", message: { _tag: "Add", id: "b" } },
        { owner: "Log", message: { _tag: "Add", id: "a" } },
        { owner: "Log", message: { _tag: "Add", id: "b" } }
      ])
      assert.deepStrictEqual(
        updates(root.log(), "/Page/Log[log]").map((
          entry
        ) => [entry.message, entry.source]),
        ["b", "a", "b"].map((id) => [
          { _tag: "Add", id },
          { _tag: "Send", path: "/Page/Log[log]/Item[i]", seq: sent.seq }
        ])
      )
    })))

  it.effect("delivers a send to a shared key to an adopting owner, and drops it without one", () =>
    provideHost(Effect.gen(function*() {
      const KeyLog = Component.sharedKey({
        name: "KeyLog",
        schema: Schema.Array(Schema.String),
        message: LogMessage,
        receives: ["Add"]
      })
      const Owner = Component.define({
        name: "KeyLog",
        model: Schema.Array(Schema.String),
        message: LogMessage,
        shares: {
          key: KeyLog,
          value: ({ model }) => model,
          schema: Schema.Array(Schema.String),
          receives: ["Add"]
        }
      }).make({
        init: () => [],
        update: ($, { id }) => [...$.model, id]
      })
      const Sender = Component.define({
        name: "KeySender",
        props: Schema.Struct({ label: Schema.String, id: Schema.String }),
        model: Schema.Null,
        message: LogMessage,
        reads: { log: { owner: KeyLog, optional: true } }
      }).make({
        init: () => null,
        update: ($, message) => $.send(KeyLog, message),
        view: (h) =>
          h.el("button")
            .on("click", LogMessage.Add({ id: h.props.id }))
            .children(
              `${h.props.label}:${h.reads.log?.join(",") ?? "alone"}`
            )
      })
      const Host = Component.define({
        name: "KeyHost",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.el("div", [
            Sender(h, { key: "out", props: { label: "out", id: "x" } }),
            Owner(h, {
              key: "log",
              view: () =>
                Sender(h, { key: "in", props: { label: "in", id: "a" } })
            })
          ])
      })
      const root = yield* TestHost.mount(Host, {})
      yield* TestHost.settle
      Locator.fire(
        root.get(Locator.text("out:alone", { exact: true })),
        "click"
      )
      Locator.fire(root.get(Locator.text("in:", { exact: true })), "click")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "out:alonein:a")
      const dropped = root.log().filter((
        entry
      ): entry is MessageLog.SendDropped => entry._tag === "SendDropped")
      assert.deepStrictEqual(dropped.map((entry) => entry.owner), ["KeyLog"])
      const [sent] = updates(root.log(), "/KeyHost/KeyLog[log]/KeySender[in]")
      assert.deepStrictEqual(sent.sends?.map(MessageLog.encodeSend), [
        { owner: "KeyLog", message: { _tag: "Add", id: "a" } }
      ])
    })))
})

describe("Story and sends", () => {
  it("records what update sent until sent acknowledges it, and given throws rather than discard it", () => {
    const steps = Story.start(Item, {}).send(ItemMessage.Adds({ ids: ["b"] }))
    assert.deepStrictEqual(
      steps.current.sent.map((send) => [send.owner, send.message]),
      [
        [Log, { _tag: "Add", id: "b" }]
      ]
    )
    // An unacknowledged send blocks the next acting step.
    assert.throws(
      () => steps.send(ItemMessage.Adds({ ids: ["c"] })),
      /Story\.send: earlier work isn't settled or acknowledged:\n {2}- \{"_tag":"Add","id":"b"\} to the owner Log was sent/
    )
    // sent asserts the oldest send, then drops it from the record.
    assert.throws(
      () => steps.sent(Log, LogMessage.Add({ id: "a" })),
      /Story\.sent: expected/
    )
    assert.lengthOf(
      steps.sent(Log, LogMessage.Add({ id: "b" })).current.sent,
      0
    )
    // The record holds only what isn't acknowledged: the new send, not the earlier one.
    steps.send(ItemMessage.Adds({ ids: ["c"] }))
    assert.deepStrictEqual(steps.current.sent.map((send) => send.message), [{
      _tag: "Add",
      id: "c"
    }])
    assert.throws(
      () => steps.given(0),
      /Story\.given: given would discard work not settled or acknowledged/
    )
    assert.strictEqual(
      steps.sent(Log, LogMessage.Add({ id: "c" })).given(0).current.model,
      0
    )
  })

  it.effect("fromLog reports a divergence when a send changes, from entries and from the Wire", () =>
    provideHost(Effect.gen(function*() {
      const log = (yield* mountAndClick).log()
      const wire = log.map(MessageLog.makeEncoder().encode)
      const [sent] = updates(log, "/Page/Log[log]/Item[i]")
      const recorded = ["b", "a", "b"].map((id) => ({
        owner: "Log",
        message: { _tag: "Add", id }
      }))
      assert.deepStrictEqual(
        (wire.find((frame) => frame.seq === sent.seq) as any).sends,
        recorded
      )
      const Changed = ItemDef.make({
        init: () => 0,
        update: ($, { ids }) =>
          $.set($.model + ids.length).send(Log, LogMessage.Add({ id: "z" })),
        view: itemView
      })
      for (const entries of [log, wire]) {
        assert.isUndefined(Story.fromLog(Item, entries).divergence)
        const divergence = Story.fromLog(Changed, entries).divergence
        assert.strictEqual(divergence?.seq, sent.seq)
        assert.deepStrictEqual(divergence?.recorded.sends, recorded)
        assert.deepStrictEqual(divergence?.recomputed.sends, [{
          owner: "Log",
          message: { _tag: "Add", id: "z" }
        }])
      }
    })))
})
