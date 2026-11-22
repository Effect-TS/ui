import { Component, MessageLog, UiSchema } from "@effect/ui"
import { Locator, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestHost.layer()))

const LogMessage = UiSchema.TaggedEnum({ Add: { id: Schema.String } })

/** An owner that keeps the ids it receives, in order. */
const Log = Component.define({
  name: "Log",
  scoped: false,
  model: Schema.Array(Schema.String),
  message: LogMessage,
  receives: ["Add"],
  shares: (ids) => ids
}).make({ init: () => [], update: (ids, { id }) => [...ids, id], parts: () => ({}) })

const ItemMessage = UiSchema.TaggedEnum({ Adds: { ids: Schema.NonEmptyArray(Schema.String) } })

/** A reader that counts the ids it sends to its log, and shows the log. */
const ItemDef = Component.define({
  name: "Item",
  scoped: false,
  model: Schema.Number,
  message: ItemMessage,
  shared: { log: Log }
})

const Item = ItemDef.make({
  init: () => 0,
  update: (count, { ids: [first, ...rest] }, $) =>
    rest.reduce(
      (step, id) => step.send(Log, LogMessage.Add({ id })),
      $.set(count + 1 + rest.length).send(Log, LogMessage.Add({ id: first }))
    ),
  view: (_, h) =>
    h.el("button").on("click", ItemMessage.Adds({ ids: ["b", "a", "b"] })).children(`log:${h.shared.log.join(",")}`)
})

const Page = Component.define({ name: "Page", scoped: false, model: Schema.Null, message: Schema.Never }).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => Log(h, { key: "log", view: () => Item(h, { key: "i" }) })
})

const updates = (log: ReadonlyArray<MessageLog.Entry>, path: string) =>
  log.filter((entry): entry is MessageLog.Update => entry._tag === "Update" && entry.path === path)

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
        updates(root.log(), "/Page/Log[log]").map((entry) => [entry.message, entry.source]),
        ["b", "a", "b"].map((id) => [
          { _tag: "Add", id },
          { _tag: "Send", path: "/Page/Log[log]/Item[i]", seq: sent.seq }
        ])
      )
    })))

  it("is the only send: define throws for a component that receives and shares nothing", () => {
    const options = { name: "Field", scoped: false, model: Schema.Null, message: LogMessage, receives: ["Add"] }
    assert.throws(
      () => Component.define(options as any),
      /^Field: only an owner receives messages, so give it shares or remove receives$/
    )
  })
})

describe("Story and sends", () => {
  it("records what update sent until sent acknowledges it, and given throws rather than discard it", () => {
    const steps = Story.start(Item, {}).send(ItemMessage.Adds({ ids: ["b"] }))
    assert.deepStrictEqual(steps.current.sent.map((send) => [send.owner, send.message]), [
      [Log, { _tag: "Add", id: "b" }]
    ])
    // An unacknowledged send blocks the next acting step.
    assert.throws(
      () => steps.send(ItemMessage.Adds({ ids: ["c"] })),
      /Story\.send: earlier work isn't settled or acknowledged:\n {2}- \{"_tag":"Add","id":"b"\} to the owner Log was sent/
    )
    // sent asserts the oldest send, then drops it from the record.
    assert.throws(() => steps.sent(Log, LogMessage.Add({ id: "a" })), /Story\.sent: expected/)
    assert.lengthOf(steps.sent(Log, LogMessage.Add({ id: "b" })).current.sent, 0)
    // The record holds only what isn't acknowledged: the new send, not the earlier one.
    steps.send(ItemMessage.Adds({ ids: ["c"] }))
    assert.deepStrictEqual(steps.current.sent.map((send) => send.message), [{ _tag: "Add", id: "c" }])
    assert.throws(() => steps.given(0), /Story\.given: given would discard work not settled or acknowledged/)
    assert.strictEqual(steps.sent(Log, LogMessage.Add({ id: "c" })).given(0).current.model, 0)
  })

  it.effect("fromLog reports a divergence when a send changes, from entries and from the Wire", () =>
    provideHost(Effect.gen(function*() {
      const log = (yield* mountAndClick).log()
      const wire = log.map(MessageLog.makeEncoder().encode)
      const [sent] = updates(log, "/Page/Log[log]/Item[i]")
      const recorded = ["b", "a", "b"].map((id) => ({ owner: "Log", message: { _tag: "Add", id } }))
      assert.deepStrictEqual((wire.find((frame) => frame.seq === sent.seq) as any).sends, recorded)
      // Sends one id, whatever the message says.
      const Changed = ItemDef.make({
        init: () => 0,
        update: (count, { ids }, $) => $.set(count + ids.length).send(Log, LogMessage.Add({ id: "z" })),
        view: Item.view
      })
      for (const entries of [log, wire]) {
        assert.isUndefined(Story.fromLog(Item, entries).divergence)
        const divergence = Story.fromLog(Changed, entries).divergence
        assert.strictEqual(divergence?.seq, sent.seq)
        assert.deepStrictEqual(divergence?.recorded.sends, recorded)
        assert.deepStrictEqual(divergence?.recomputed.sends, [{ owner: "Log", message: { _tag: "Add", id: "z" } }])
      }
    })))
})
