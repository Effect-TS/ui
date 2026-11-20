import { Component, Feature, MessageLog, UiSchema } from "@effect/ui"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Layer, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestHost.layer()))
const click = (root: TestHost.TestRoot<any, any, any>, text: string) =>
  Locator.fire(root.get(Locator.text(text, { exact: true })), "click")

const ItemMessage = UiSchema.TaggedEnum({ Clear: {}, Boom: {} })

/** Counts the `Clear`s it receives, and shows the label it had at the last one. */
const Item = Component.define({
  name: "Item",
  lifetime: "view",
  props: Schema.Struct({ label: Schema.String }),
  model: Schema.Struct({ clears: Schema.Number, label: Schema.String }),
  message: ItemMessage,
  receives: ["Clear"]
}).make({
  init: () => ({ clears: 0, label: "" }),
  update: (model, message, $) => {
    if (message._tag === "Boom") throw new Error("boom")
    return { clears: model.clears + 1, label: $.props.label }
  },
  view: (model, h) =>
    h.el("li").on("click", ItemMessage.Boom()).children(
      `${h.props.label}:${model.clears}:${model.label}`
    )
})

const Row = Item.ref("Row")

const ListMessage = UiSchema.TaggedEnum({
  Clear: { id: Schema.String },
  Add: { id: Schema.String },
  Clears: { ids: Schema.Array(Schema.String) }
})

const List = Component.define({
  name: "List",
  lifetime: "view",
  props: Schema.Struct({ ids: Schema.Array(Schema.String) }),
  model: Schema.Array(Schema.String),
  message: ListMessage
}).make({
  init: ($) => $.props.ids,
  update: (ids, message, $) => {
    switch (message._tag) {
      case "Clear":
        return $.send(Row.at(message.id), { _tag: "Clear" })
      case "Add":
        return $.set([...ids, message.id]).send(Row.at(message.id), { _tag: "Clear" })
      case "Clears":
        return message.ids.reduce((step, id) => step.send(Row.at(id), { _tag: "Clear" }), $.set(ids))
    }
  },
  view: (ids, h) => h.el("ul", ids.map((id) => Item(h, { ref: Row.at(id), props: { label: `${id}${ids.length}` } })))
})

const updates = (log: ReadonlyArray<MessageLog.Entry>, path: string) =>
  log.filter((entry): entry is MessageLog.Update => entry._tag === "Update" && entry.path === path)

const dropped = (log: ReadonlyArray<MessageLog.Entry>) =>
  log.filter((entry): entry is MessageLog.SendDropped => entry._tag === "SendDropped")

describe("$.send", () => {
  it.effect("reaches the child with the ref's key, among several of one component", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(List, { ids: ["a", "b", "c"] })
      yield* TestHost.settle
      root.send(ListMessage.Clear({ id: "b" }))
      yield* TestHost.settle
      assert.strictEqual(root.text(), "a3:0:b3:1:b3c3:0:")
      const [sent] = updates(root.log(), "/List")
      assert.deepStrictEqual(sent.sends?.map((send) => [send.ref?.key, send.message]), [["Row[b]", { _tag: "Clear" }]])
      const [received] = updates(root.log(), "/List/Item[Row[b]]")
      assert.deepStrictEqual(received.source, { _tag: "Send", path: "/List", seq: sent.seq })
      assert.deepStrictEqual(received.message, { _tag: "Clear" })
      assert.lengthOf(updates(root.log(), "/List/Item[Row[a]]"), 0)
    })))

  it.effect("reaches a child mounted in the same step, which has the props from the new Model", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(List, { ids: ["a"] })
      yield* TestHost.settle
      root.send(ListMessage.Add({ id: "b" }))
      yield* TestHost.settle
      // The child's re-render lands in the parent's commit: no frame shows the new row before the send.
      assert.deepStrictEqual(root.frames(), ["a1:0:", "a2:0:b2:1:b2"])
    })))

  it.effect("delivers several sends in the order they were issued", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(List, { ids: ["a", "b"] })
      yield* TestHost.settle
      root.send(ListMessage.Clears({ ids: ["b", "a", "b"] }))
      yield* TestHost.settle
      assert.strictEqual(root.text(), "a2:1:a2b2:2:b2")
      assert.deepStrictEqual(
        root.log().flatMap((entry) => entry._tag === "Update" && entry.path !== "/List" ? [entry.path] : []),
        ["/List/Item[Row[b]]", "/List/Item[Row[a]]", "/List/Item[Row[b]]"]
      )
    })))

  it.effect("drops and logs a send to a ref that isn't rendered", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(List, { ids: ["a"] })
      yield* TestHost.settle
      root.send(ListMessage.Clear({ id: "z" }))
      yield* TestHost.settle
      const [sent] = updates(root.log(), "/List")
      const [drop] = dropped(root.log())
      assert.strictEqual(drop.path, "/List")
      assert.strictEqual(drop.ref, "Row[z]")
      assert.deepStrictEqual(drop.issued, { seq: sent.seq, index: 0 })
      assert.strictEqual(drop.reason, "unrendered")
      assert.strictEqual(root.text(), "a1:0:")
    })))

  it.effect("drops and logs a send to a child that failed", () =>
    provideHost(Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({ Boom: {}, Clear: {} })
      const Draft = Item.ref("Draft")
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Null, message: Message }).make({
        init: () => null,
        update: (model, message, $) => message._tag === "Clear" ? $.send(Draft, { _tag: "Clear" }) : model,
        view: (_, h) =>
          Item(h, {
            ref: Draft,
            props: { label: "d" },
            fallback: () => h.text("failed"),
            onEmit: () => undefined
          })
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "d:0:")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "failed")
      root.send(Message.Clear())
      yield* TestHost.settle
      const [drop] = dropped(root.log())
      assert.strictEqual(drop.ref, "Draft")
      assert.strictEqual(drop.reason, "failed")
    })))

  it.effect("drops and logs a send to a feature on its fallback", () =>
    provideHost(Effect.gen(function*() {
      const EditorReceives = UiSchema.TaggedEnum({ Clear: {} })
      class Editor extends Feature.Service<Editor>()("Editor", {
        props: Schema.Struct({ label: Schema.String }),
        receives: EditorReceives
      }) {}
      const Main = Editor.ref("Main")
      const Message = UiSchema.TaggedEnum({ Clear: {} })
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Null, message: Message }).make({
        init: () => null,
        update: (_, __, $) => $.send(Main, { _tag: "Clear" }),
        view: (_, h) => Editor.render(h, { ref: Main, props: { label: "m" }, fallback: () => h.text("loading") })
      })
      const Never: Layer.Layer<Editor> = Layer.effect(Editor, Effect.never)
      const root = yield* TestHost.mount(Component.provide(Page, Never), {})
      root.send(Message.Clear())
      yield* TestHost.settle
      assert.strictEqual(root.text(), "loading")
      const [drop] = dropped(root.log())
      assert.strictEqual(drop.ref, "Main")
      assert.strictEqual(drop.reason, "fallback")
    })))

  it.effect("reaches a feature's implementation, and a provided component, through a ref", () =>
    provideHost(Effect.gen(function*() {
      const EditorReceives = UiSchema.TaggedEnum({ Clear: {} })
      class Editor extends Feature.Service<Editor>()("Editor", {
        props: Schema.Struct({ label: Schema.String }),
        receives: EditorReceives
      }) {}
      const Main = Editor.ref("Main")
      const Draft = Item.ref("Draft")
      const Provided = Component.provide(Item, Layer.empty)
      const Message = UiSchema.TaggedEnum({ Clear: {} })
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Null, message: Message }).make({
        init: () => null,
        update: (_, __, $) => $.send(Main, { _tag: "Clear" }).send(Draft, { _tag: "Clear" }),
        view: (_, h) =>
          h.el(
            "div",
            Editor.render(h, { ref: Main, props: { label: "m" }, fallback: () => h.text("loading") }),
            Provided(h, { ref: Draft, props: { label: "d" } })
          )
      })
      const root = yield* TestHost.mount(Component.provide(Page, Editor.toLayer(Item)), {})
      yield* TestHost.settle
      root.send(Message.Clear())
      yield* TestHost.settle
      assert.strictEqual(root.text(), "m:1:md:1:d")
      assert.lengthOf(dropped(root.log()), 0)
    })))

  it.effect("fails the sender when a parent and child answer each other", () =>
    provideHost(Effect.gen(function*() {
      const PingMessage = UiSchema.TaggedEnum({ Ping: {} })
      const Echo = Component.define({
        name: "Echo",
        lifetime: "view",
        model: Schema.Null,
        message: PingMessage,
        events: PingMessage,
        receives: ["Ping"]
      }).make({
        init: () => null,
        update: (model, message, $) => $.set(model).emit(message),
        view: (_, h) => h.text("echo")
      })
      const Other = Echo.ref("Other")
      const Loop = Component.define({ name: "Loop", lifetime: "view", model: Schema.Null, message: PingMessage }).make({
        init: () => null,
        update: (_, message, $) => $.send(Other, message),
        view: (_, h) =>
          h.el("button").on("click", PingMessage.Ping()).children(
            Echo(h, { ref: Other, onEmit: (ping) => ping })
          )
      })
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Null, message: PingMessage }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => Loop(h, { key: "l", fallback: () => h.text("looped") })
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "echo")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "looped")
      const failed = root.log().filter((entry): entry is MessageLog.Failed => entry._tag === "Failed")
      assert.lengthOf(failed, 1)
      assert.strictEqual(failed[0].path, "/Page/Loop[l]")
      assert.strictEqual(failed[0].in, "send")
      assert.include(Cause.pretty(failed[0].cause), "/Page/Loop[l] sent to its children")
    })))

  it.effect("doesn't count independent sends against each other", () =>
    provideHost(Effect.gen(function*() {
      const GoMessage = UiSchema.TaggedEnum({ Go: {} })
      const Leaf = Component.define({
        name: "Leaf",
        lifetime: "view",
        model: Schema.Number,
        message: GoMessage,
        receives: ["Go"]
      }).make({
        init: () => 0,
        update: (n) => n + 1,
        view: (n, h) => h.text(String(n))
      })
      const LeafRef = Leaf.ref("Leaf")
      // Each row forwards the send it gets to its own leaf.
      const Row = Component.define({
        name: "Row",
        lifetime: "view",
        model: Schema.Null,
        message: GoMessage,
        receives: ["Go"]
      }).make({
        init: () => null,
        update: (_, __, $) => $.send(LeafRef, { _tag: "Go" }),
        view: (_, h) => Leaf(h, { ref: LeafRef })
      })
      const Rows = Row.ref("Rows")
      const keys = Array.from({ length: 150 }, (_, i) => i)
      const List = Component.define({ name: "List", lifetime: "view", model: Schema.Null, message: GoMessage }).make({
        init: () => null,
        update: (_, __, $) => keys.reduce((step, i) => step.send(Rows.at(i), { _tag: "Go" }), $.set(null)),
        view: (_, h) => h.el("div", keys.map((i) => Row(h, { ref: Rows.at(i) })))
      })
      const root = yield* TestHost.mount(List, {})
      yield* TestHost.settle
      root.send(GoMessage.Go())
      yield* TestHost.settle
      assert.strictEqual(root.text(), "1".repeat(150))
      assert.isFalse(root.log().some((entry) => entry._tag === "Failed"))
    })))
})

describe("Story and sends", () => {
  it("records what update sent until sent acknowledges it, and given throws rather than discard it", () => {
    const steps = Story.start(List, { ids: ["a", "b"] })
      .send(ListMessage.Clear({ id: "b" }))
    assert.deepStrictEqual(steps.current.sent.map((send) => [send.ref?.key, send.message]), [
      ["Row[b]", { _tag: "Clear" }]
    ])
    // An unacknowledged send blocks the next acting step.
    assert.throws(
      () => steps.send(ListMessage.Add({ id: "c" })),
      /Story\.send: earlier work isn't settled or acknowledged:\n {2}- \{"_tag":"Clear"\} to Row\[b\] was sent/
    )
    // sent asserts the oldest send, then drops it from the record.
    assert.throws(() => steps.sent(Row.at("a"), { _tag: "Clear" }), /Story\.sent: expected/)
    assert.lengthOf(steps.sent(Row.at("b"), { _tag: "Clear" }).current.sent, 0)
    // The record holds only what isn't acknowledged: the new send, not the earlier one.
    steps.send(ListMessage.Add({ id: "c" }))
    assert.deepStrictEqual(steps.current.sent.map((send) => [send.ref?.key, send.message]), [
      ["Row[c]", { _tag: "Clear" }]
    ])
    assert.throws(() => steps.given(["a"]), /Story\.given: given would discard work not settled or acknowledged/)
    assert.deepStrictEqual(steps.sent(Row.at("c"), { _tag: "Clear" }).given(["a"]).current.model, ["a"])
  })

  it.effect("finds a child by its ref in childEmit, childFailure and fallback", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({ Saw: { what: Schema.String } })
      const EchoMessage = UiSchema.TaggedEnum({ Said: {} })
      const Echo = Component.define({
        name: "Echo",
        lifetime: "view",
        model: Schema.Null,
        message: EchoMessage,
        events: EchoMessage
      }).make({ init: () => null, update: (model) => model, view: (_, h) => h.text("echo") })
      const Mine = Echo.ref("Mine")
      const Page = Component.define({
        name: "Page",
        lifetime: "view",
        model: Schema.Array(Schema.String),
        message: Message
      }).make({
        init: () => [],
        update: (seen, message) => [...seen, message.what],
        view: (seen, h) =>
          h.el("div", [
            h.el("p", seen.join(",")),
            Echo(h, {
              ref: Mine,
              onEmit: () => Message.Saw({ what: "emit" }),
              onFailure: () => Message.Saw({ what: "failure" }),
              fallback: () => h.text("gone")
            })
          ])
      })
      const s = yield* Scene.make(Page, {})
      s.childEmit(Echo, Mine, { _tag: "Said" }).childFailure(Echo, Mine, Cause.die("x"))
        .expect(Locator.tag("p")).toHaveText("emit,failure")
      assert.deepStrictEqual(Scene.fallback(s.view, Echo, Mine, AsyncResult.initial()), { _tag: "Text", text: "gone" })
      assert.throws(
        () => Scene.start(Page, {}).childEmit(Echo, Echo.ref("Other"), { _tag: "Said" }),
        /no child Echo with the ref Other/
      )
    }))

  it.effect("fromLog reports a divergence when a send changes, from entries and from the Wire", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(List, { ids: ["a", "b"] })
      yield* TestHost.settle
      root.send(ListMessage.Clear({ id: "b" }))
      yield* TestHost.settle
      const log = root.log()
      const encoder = MessageLog.makeEncoder()
      const wire = log.map((entry) => encoder.encode(entry))
      const [sent] = updates(log, "/List")
      assert.deepStrictEqual((wire.find((frame) => frame.seq === sent.seq) as any).sends, [{
        ref: "Row[b]",
        message: { _tag: "Clear" }
      }])
      // Sends to the first row, whatever the message says.
      const Changed = Component.define({
        name: "List",
        lifetime: "view",
        props: Schema.Struct({ ids: Schema.Array(Schema.String) }),
        model: Schema.Array(Schema.String),
        message: ListMessage
      }).make({
        init: ($) => $.props.ids,
        update: (ids, _, $) => $.set(ids).send(Row.at(ids[0]), { _tag: "Clear" }),
        view: (ids, h) => h.el("ul", ids.map((id) => Item(h, { ref: Row.at(id), props: { label: id } })))
      })
      for (const entries of [log, wire]) {
        assert.isUndefined(Story.fromLog(List, entries).divergence)
        const divergence = Story.fromLog(Changed, entries).divergence
        assert.strictEqual(divergence?.seq, sent.seq)
        assert.deepStrictEqual(divergence?.recorded.sends, [{ ref: "Row[b]", message: { _tag: "Clear" } }])
        assert.deepStrictEqual(divergence?.recomputed.sends, [{ ref: "Row[a]", message: { _tag: "Clear" } }])
      }
    })))

  it.effect("stub records what a parent sends it", () =>
    provideHost(Effect.gen(function*() {
      const EditorReceives = UiSchema.TaggedEnum({ Clear: {}, Focus: {} })
      class Editor extends Feature.Service<Editor>()("Editor", {
        props: Schema.Struct({}),
        receives: EditorReceives
      }) {}
      const Main = Editor.ref("Main")
      const Message = UiSchema.TaggedEnum({ Go: {} })
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Null, message: Message }).make({
        init: () => null,
        update: (_, __, $) => $.send(Main, { _tag: "Focus" }).send(Main, { _tag: "Clear" }),
        view: (_, h) => Editor.render(h, { ref: Main, fallback: () => h.text("loading") })
      })
      const stub = TestHost.stub(Editor)
      const root = yield* TestHost.mount(Page, {}).pipe(Effect.provide(stub.layer))
      yield* TestHost.settle
      root.send(Message.Go())
      yield* TestHost.settle
      assert.deepStrictEqual(stub.received(), [{ _tag: "Focus" }, { _tag: "Clear" }])
    })))
})
