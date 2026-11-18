import { Command, Component, Feature, MessageLog, UiSchema, type View } from "@effect/ui"
import * as replay from "@effect/ui/internal/replay"
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

/** Whether a view shows a child of `component` in place: what a feature slot shows once it's ready. */
const showsChild = (node: View.Node<any, any>, component: unknown): boolean =>
  node._tag === "Child"
    ? node.component === component
    : node._tag === "Element" && node.children.some((child) => showsChild(child, component))

/** What `Story.fromLog` reached, rendered as a Scene renders. */
const replayed = (component: Parameters<typeof Story.fromLog>[0], entries: Parameters<typeof Story.fromLog>[1]) =>
  replay.viewOf(Story.fromLog(component, entries))

/** The Layer entries' tags, in order. */
const layerTags = (log: ReadonlyArray<MessageLog.Entry>) =>
  log.flatMap((entry) =>
    entry._tag === "LayerPending" || entry._tag === "LayerReady" || entry._tag === "LayerFailed" ? [entry._tag] : []
  )

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

  it.effect("Story.fromLog renders the slot's fallback before LayerReady, and the feature child after", () =>
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
        const before = replayed(Gated, entries)
        assert.strictEqual(textOf(before), "doc:loading")
        assert.isFalse(showsChild(before, Editor))
      }
      for (const entries of [log, log.map(encode)]) {
        // A Story view doesn't render a feature child's own view: the child is in the fallback's place.
        const after = replayed(Gated, entries)
        assert.strictEqual(textOf(after), "doc:")
        assert.isTrue(showsChild(after, Editor))
      }
    })))

  it.effect("Story.fromLog reads the Layer an instance renders with by its logged boundary, not by its path", () =>
    provideHost(Effect.gen(function*() {
      class Viewer extends Feature.Service<Viewer>()("SlotStatus/Viewer", { props: Schema.Struct({}) }) {}
      const gate = yield* Deferred.make<void>()
      // A plain child below a pending provider reads that provider's Layer.
      const Panel = Component.define({ name: "Panel", model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) =>
          h.el("div", "panel:", Editor.render(h, { key: "e", props: {}, fallback: (r) => h.text(shown(r)) }))
      })
      // A component a pending provider's fallback placed renders against the settled services above it.
      const Spinner = Component.define({ name: "Spinner", model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) =>
          h.el("div", "spinner:", Editor.render(h, { key: "e", props: {}, fallback: (r) => h.text(shown(r)) }))
      })
      const Inner = Component.provide(
        Component.define({ name: "Inner", model: Schema.Null, message: Schema.Never }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.el(
              "div",
              Panel(h, { key: "p" }),
              Viewer.render(h, { key: "v", props: {}, fallback: () => Spinner(h, { key: "s" }) })
            )
        }),
        Layer.mergeAll(Viewer.toLayer(EditorView), Editor.toLayer(EditorView)).pipe(
          Layer.provide(Layer.effectDiscard(Deferred.await(gate)))
        )
      )
      const Outer = Component.provide(
        Component.define({ name: "Outer", model: Schema.Null, message: Schema.Never }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.el("div", Inner(h, { key: "i" }))
        }),
        Editor.toLayer(EditorView)
      )
      const root = yield* TestHost.mount(Outer, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "panel:loadingspinner:editor")
      const log = root.log()
      const encode = MessageLog.makeEncoder().encode
      for (const entries of [log, log.map(encode)]) {
        assert.strictEqual(textOf(replayed(Panel, entries)), "panel:loading")
        // Below the pending provider's path, yet its slot shows the feature: it reads Outer's Layer.
        const spinner = replayed(Spinner, entries)
        assert.strictEqual(textOf(spinner), "spinner:")
        assert.isTrue(showsChild(spinner, Editor))
      }
      yield* Deferred.succeed(gate, undefined)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "panel:editoreditor")
      assert.isTrue(showsChild(replayed(Panel, root.log()), Editor))
    })))

  it.effect("a keyed selection that builds at once logs LayerReady after a pending or failed one", () =>
    provideHost(Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({ Move: { room: Schema.Literals(["a", "b", "c"]) }, Failed: {} })
      const gates = { a: yield* Deferred.make<void, string>(), c: yield* Deferred.make<void, string>() }
      const Room = Component.define({ name: "Room", model: Schema.Literals(["a", "b", "c"]), message: Message }).make({
        init: () => "a" as const,
        update: (room, message) => Message.match(message, { Move: ({ room }) => room, Failed: () => room }),
        view: (room, h) =>
          h.el("div", room + ":", Editor.render(h, { key: "e", props: {}, fallback: (r) => h.text(shown(r)) }))
      })
      const Keyed = Component.provide(Room, {
        key: (_, room) => room,
        layer: (room) =>
          room === "b"
            ? Editor.toLayer(EditorView)
            : Editor.toLayer(EditorView).pipe(Layer.provide(Layer.effectDiscard(Deferred.await(gates[room]))))
      }, { onFailure: () => Message.Failed() })
      const root = yield* TestHost.mount(Keyed, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "a:loading")
      root.send(Message.Move({ room: "b" }))
      yield* TestHost.settle
      assert.strictEqual(root.text(), "b:editor")
      assert.deepStrictEqual(layerTags(root.log()), ["LayerPending", "LayerReady"])
      assert.isTrue(showsChild(replayed(Keyed, root.log()), Editor))
      root.send(Message.Move({ room: "c" }))
      yield* Deferred.fail(gates.c, "offline")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "c:down")
      assert.strictEqual(textOf(replayed(Keyed, root.log())), "c:down")
      root.send(Message.Move({ room: "b" }))
      yield* TestHost.settle
      assert.strictEqual(root.text(), "b:editor")
      // `c` failed as it was selected, so it logged no `LayerPending`.
      assert.deepStrictEqual(layerTags(root.log()), ["LayerPending", "LayerReady", "LayerFailed", "LayerReady"])
      assert.isTrue(showsChild(replayed(Keyed, root.log()), Editor))
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

  it.effect("h.isRunning counts a stopping run until its fiber exits, in the runtime and in Story.fromLog's view", () =>
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
      const both = () => [root.text(), textOf(replayed(Jobs, root.log()))]
      assert.deepStrictEqual(both(), ["idle", "idle"])
      root.send(Msg.Go())
      yield* TestHost.settle
      assert.deepStrictEqual(both(), ["running", "running"])
      // Stopping: interrupted, and its cleanup is still running.
      root.send(Msg.Stop())
      yield* TestHost.settle
      assert.deepStrictEqual(both(), ["running", "running"])
      Deferred.doneUnsafe(cleanup, Exit.void)
      yield* TestHost.settle
      assert.deepStrictEqual(both(), ["idle", "idle"])
    })))
})
