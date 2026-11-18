import { Command, Component, Feature, MessageLog, UiSchema, type View } from "@effect/ui"
import { Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Layer, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestHost.layer()))

class Editor extends Feature.Service<Editor>()("SlotStatus/Editor", { props: Schema.Struct({}) }) {}
const EditorView = Component.define({ name: "EditorView", model: Schema.Null, message: Schema.Never }).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.text("editor")
})
const shown = (result: AsyncResult.AsyncResult<never, unknown>) => AsyncResult.isFailure(result) ? "down" : "loading"

/** The text a view shows: a child the scene didn't expand shows none. */
const textOf = (node: View.Node<any, any>): string =>
  node._tag === "Text" ? node.text : node._tag === "Element" ? node.children.map(textOf).join("") : ""

const Doc = Component.define({ name: "Doc", model: Schema.Null, message: Schema.Never }).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.el("div", "doc:", Editor.render(h, { key: "e", props: {}, fallback: (r) => h.text(shown(r)) }))
})

describe("slot status", () => {
  it.effect("a keyed provide shows the slot's fallback while it rebuilds, and its failure branch if the rebuild fails", () =>
    provideHost(Effect.gen(function*() {
      const gates = { a: yield* Deferred.make<void, string>(), b: yield* Deferred.make<void, string>() }
      const Message = UiSchema.TaggedEnum({ Move: { room: Schema.Literals(["a", "b"]) }, Failed: {} })
      const Room = Component.define({
        name: "Room",
        model: Schema.Literals(["a", "b"]),
        message: Message
      }).make({
        init: () => "a" as const,
        update: (room, message) => Message.match(message, { Move: ({ room }) => room, Failed: () => room }),
        view: (room, h) =>
          h.el("div", room + ":", Editor.render(h, { key: "e", props: {}, fallback: (r) => h.text(shown(r)) }))
      })
      const Keyed = Component.provide(Room, {
        key: (_, room) => room,
        layer: (room) =>
          Editor.toLayer(EditorView).pipe(Layer.provide(Layer.effectDiscard(Deferred.await(gates[room]))))
      }, { onFailure: () => Message.Failed() })
      const root = yield* TestHost.mount(Keyed, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "a:loading")
      yield* Deferred.succeed(gates.a, undefined)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "a:editor")
      root.send(Message.Move({ room: "b" }))
      yield* TestHost.settle
      // Today's behaviour, kept: the old view isn't kept while the new selection builds.
      assert.strictEqual(root.text(), "b:loading")
      yield* Deferred.fail(gates.b, "offline")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "b:down")
      assert.deepStrictEqual(
        root.log().flatMap((entry) => entry._tag === "LayerPending" ? [entry.status] : []),
        ["Pending", "Rebuilding"]
      )
    })))

  it.effect("Story.fromLog folds the Layer's entries: pending before LayerReady, ready after", () =>
    provideHost(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const Gated = Component.provide(
        Doc,
        Editor.toLayer(EditorView).pipe(Layer.provide(Layer.effectDiscard(Deferred.await(gate))))
      )
      const root = yield* TestHost.mount(Gated, {})
      yield* TestHost.settle
      yield* Deferred.succeed(gate, undefined)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "doc:editor")
      const log = root.log()
      const ready = log.findIndex((entry) => entry._tag === "LayerReady")
      const encode = MessageLog.makeEncoder().encode
      for (const entries of [log.slice(0, ready), log.slice(0, ready).map(encode)]) {
        const before = Story.fromLog(Gated, entries)
        assert.strictEqual(before.status, "Pending")
        // What the slot showed at those entries.
        const scene = Scene.start(Gated, before.props).given(before.model).childPending(Editor, "e")
        assert.strictEqual(textOf(scene.view), "doc:loading")
      }
      for (const entries of [log, log.map(encode)]) {
        const after = Story.fromLog(Gated, entries)
        assert.strictEqual(after.status, "Ready")
        assert.strictEqual(textOf(Scene.start(Gated, after.props).given(after.model).view), "doc:")
      }
    })))

  it("Scene's childPending shows a slot's pending branch, and childFailure its failure branch", () => {
    const pending = Scene.start(Doc, {}).childPending(Editor, "e")
    assert.strictEqual(textOf(pending.view), "doc:loading")
    assert.strictEqual(textOf(pending.childFailure(Editor, "e", Cause.fail("offline")).view), "doc:down")
    assert.strictEqual(textOf(Scene.start(Doc, {}).childFailure(Editor, "e", Cause.fail("offline")).view), "doc:down")
    const Bare = Component.define({ name: "Bare", model: Schema.Null, message: Schema.Never }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => h.el("div", EditorView(h, {}))
    })
    assert.throws(
      () => Scene.start(Bare, {}).childPending(EditorView),
      /^Scene\.childPending: the child has no fallback to show while it's pending$/
    )
  })

  it.effect("h.isRunning counts a stopping run until its fiber exits, in the runtime and in Story.fromLog", () =>
    provideHost(Effect.gen(function*() {
      const cleanup = yield* Deferred.make<void>()
      const Job = Command.make(
        "SlotStatus/Job",
        { args: {} },
        () => Effect.never.pipe(Effect.onInterrupt(() => Deferred.await(cleanup)))
      )
      const Msg = UiSchema.TaggedEnum({ Go: {}, Stop: {} })
      const Jobs = Component.define({ name: "Jobs", model: Schema.Null, message: Msg }).make({
        init: () => null,
        update: (model, message, $) =>
          Msg.match(message, {
            Go: () => $.set(model).run(Job().pipe(Command.asNoop)),
            Stop: () => $.set(model).run(Command.interrupt(Job))
          }),
        view: (_, h) => h.text(h.isRunning(Job) ? "running" : "idle")
      })
      const root = yield* TestHost.mount(Jobs, {})
      const replayed = () => Story.fromLog(Jobs, root.log()).isRunning(Job) ? "running" : "idle"
      root.send(Msg.Go())
      yield* TestHost.settle
      assert.deepStrictEqual([root.text(), replayed()], ["running", "running"])
      // Stopping: interrupted, and its cleanup is still running.
      root.send(Msg.Stop())
      yield* TestHost.settle
      assert.deepStrictEqual([root.text(), replayed()], ["running", "running"])
      Deferred.doneUnsafe(cleanup, Exit.void)
      yield* TestHost.settle
      assert.deepStrictEqual([root.text(), replayed()], ["idle", "idle"])
    })))
})
