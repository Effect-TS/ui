import { Command, Component, type MessageLog } from "@effect/ui"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Schema } from "effect"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestHost.layer()))

/** A parent that holds a number and shows a child that reads it in `update`. */
const makeApp = () => {
  const views: Array<string> = []
  const ChildMessage = Schema.TaggedUnion({ Read: {} })
  const Child = Component.define({
    name: "Child",
    props: Schema.Struct({ n: Schema.Number }),
    model: Schema.Struct({ seen: Schema.Number }),
    message: ChildMessage
  }).make({
    init: () => ({ seen: -1 }),
    update: (_model, _message, $) => ({ seen: $.props.n }),
    view: (model, h) => {
      views.push(`child ${h.props.n}/${model.seen}`)
      return h.el("button").on("click", ChildMessage.make({ _tag: "Read" })).children(`${h.props.n}/${model.seen}`)
    }
  })
  const ParentMessage = Schema.TaggedUnion({ Inc: {}, Hide: {} })
  const Parent = Component.define({
    name: "Parent",
    model: Schema.Struct({ n: Schema.Number, shown: Schema.Boolean }),
    message: ParentMessage
  }).make({
    init: () => ({ n: 0, shown: true }),
    update: (model, message) =>
      message._tag === "Inc" ? { ...model, n: model.n + 1 } : { ...model, shown: false },
    view: (model, h) => {
      views.push(`parent ${model.n}`)
      return h.el("div").children(model.shown ? Child(h, { key: "child", props: { n: model.n } }) : "gone")
    }
  })
  return { Parent, ParentMessage, views }
}

const rows = (log: ReadonlyArray<MessageLog.Entry>) =>
  log.flatMap((entry) =>
    entry._tag === "Update"
      ? [`${entry.path} ${JSON.stringify(entry.message)} -> ${JSON.stringify(entry.model)}`]
      : entry._tag === "PropsChanged" || entry._tag === "Unmounted"
      ? [`${entry.path} ${entry._tag}`]
      : []
  )

describe("render timing", () => {
  for (const between of [true, false]) {
    const when = between ? "after the flush" : "before the flush"

    it.effect(`a child's update reads the props its parent's Model gives it, ${when}`, () =>
      provideHost(Effect.gen(function*() {
        const app = makeApp()
        const root = yield* TestHost.mount(app.Parent, {})
        yield* TestHost.settle
        const button = root.get(Locator.tag("button"))
        root.send(app.ParentMessage.make({ _tag: "Inc" }))
        if (between) yield* TestHost.settle
        Locator.fire(button, "click")
        yield* TestHost.settle
        assert.strictEqual(root.text(), "1/1")
        assert.deepStrictEqual(rows(root.log()), [
          "/Parent {\"_tag\":\"Inc\"} -> {\"n\":1,\"shown\":true}",
          "/Parent/Child[child] PropsChanged",
          "/Parent/Child[child] {\"_tag\":\"Read\"} -> {\"seen\":1}"
        ])
      })))

    it.effect(`a child its parent no longer renders takes no message, ${when}`, () =>
      provideHost(Effect.gen(function*() {
        const app = makeApp()
        const root = yield* TestHost.mount(app.Parent, {})
        yield* TestHost.settle
        const button = root.get(Locator.tag("button"))
        root.send(app.ParentMessage.make({ _tag: "Hide" }))
        if (between) yield* TestHost.settle
        Locator.fire(button, "click")
        yield* TestHost.settle
        assert.strictEqual(root.text(), "gone")
        assert.deepStrictEqual(rows(root.log()), [
          "/Parent {\"_tag\":\"Hide\"} -> {\"n\":0,\"shown\":false}",
          "/Parent/Child[child] Unmounted"
        ])
      })))
  }

  it.effect("the instance a message is on its way to renders once, in the flush", () =>
    provideHost(Effect.gen(function*() {
      const app = makeApp()
      const root = yield* TestHost.mount(app.Parent, {})
      yield* TestHost.settle
      app.views.length = 0
      root.send(app.ParentMessage.make({ _tag: "Inc" }))
      Locator.fire(root.get(Locator.tag("button")), "click")
      // The parent rendered for the child's update. The child's own view waits.
      assert.deepStrictEqual(app.views, ["parent 1"])
      assert.strictEqual(root.text(), "0/-1")
      yield* TestHost.settle
      assert.deepStrictEqual(app.views, ["parent 1", "child 1/1"])
      assert.strictEqual(root.text(), "1/1")
    })))

  it.effect("a message to an instance with nothing dirty above it renders nothing early", () =>
    provideHost(Effect.gen(function*() {
      const app = makeApp()
      const root = yield* TestHost.mount(app.Parent, {})
      yield* TestHost.settle
      app.views.length = 0
      Locator.fire(root.get(Locator.tag("button")), "click")
      root.send(app.ParentMessage.make({ _tag: "Inc" }))
      root.send(app.ParentMessage.make({ _tag: "Inc" }))
      assert.deepStrictEqual(app.views, [])
      yield* TestHost.settle
      assert.deepStrictEqual(app.views, ["parent 2", "child 2/0"])
    })))
})

describe("causedBy", () => {
  const seqOf = (log: ReadonlyArray<MessageLog.Entry>, tag: string, path: string, nth = 0) =>
    log.filter((entry) => entry._tag === tag && "path" in entry && entry.path === path)[nth]!

  it.effect("the entries of the first mount name the session's start", () =>
    provideHost(Effect.gen(function*() {
      const app = makeApp()
      const root = yield* TestHost.mount(app.Parent, {})
      yield* TestHost.settle
      const log = root.log()
      assert.strictEqual(log[0]!._tag, "SessionStarted")
      assert.strictEqual(log[0]!.causedBy, undefined)
      assert.deepStrictEqual(log.slice(1).map((entry) => entry.causedBy), log.slice(1).map(() => log[0]!.seq))
    })))

  it.effect("a message from outside names nothing, and what its render logs names it", () =>
    provideHost(Effect.gen(function*() {
      const app = makeApp()
      const root = yield* TestHost.mount(app.Parent, {})
      yield* TestHost.settle
      root.send(app.ParentMessage.make({ _tag: "Inc" }))
      yield* TestHost.settle
      root.send(app.ParentMessage.make({ _tag: "Hide" }))
      yield* TestHost.settle
      const log = root.log()
      const inc = seqOf(log, "Update", "/Parent", 0)
      const hide = seqOf(log, "Update", "/Parent", 1)
      assert.strictEqual(inc.causedBy, undefined)
      assert.strictEqual(hide.causedBy, undefined)
      assert.strictEqual(seqOf(log, "PropsChanged", "/Parent/Child[child]").causedBy, inc.seq)
      assert.strictEqual(seqOf(log, "Unmounted", "/Parent/Child[child]").causedBy, hide.seq)
    })))

  it.effect("two messages rendered by one flush: each instance's entries name the last to change it", () =>
    provideHost(Effect.gen(function*() {
      const app = makeApp()
      const root = yield* TestHost.mount(app.Parent, {})
      yield* TestHost.settle
      root.send(app.ParentMessage.make({ _tag: "Inc" }))
      root.send(app.ParentMessage.make({ _tag: "Inc" }))
      yield* TestHost.settle
      const log = root.log()
      const changed = log.filter((entry) => entry._tag === "PropsChanged")
      assert.strictEqual(changed.length, 1)
      assert.strictEqual(changed[0]!.causedBy, seqOf(log, "Update", "/Parent", 1).seq)
    })))

  it.effect("a message a Command resolves with names nothing, and an interrupted run names what cut it", () =>
    provideHost(Effect.gen(function*() {
      const gate = yield* Deferred.make<string>()
      const Load = Command.make("test/Load", { args: {} }, () => Deferred.await(gate))
      const Hang = Command.make("test/Hang", { args: {}, mode: "switch" }, () => Effect.never)
      const Message = Schema.TaggedUnion({ Start: {}, Loaded: { value: Schema.String }, Stop: {} })
      const App = Component.define({ name: "App", model: Schema.String, message: Message }).make({
        init: () => "",
        update: (model, message, $) => {
          switch (message._tag) {
            case "Start":
              return $.set(model).run(
                Load().pipe(Command.map((value) => Message.make({ _tag: "Loaded", value }))),
                Command.asNoop(Hang())
              )
            case "Loaded":
              return message.value
            case "Stop":
              return $.set(model).run(Command.asNoop(Hang()))
          }
        },
        view: (model, h) => h.el("p").children(model)
      })
      const root = yield* TestHost.mount(App, {})
      yield* TestHost.settle
      root.send(Message.make({ _tag: "Start" }))
      yield* TestHost.settle
      yield* Deferred.succeed(gate, "done")
      yield* TestHost.settle
      root.send(Message.make({ _tag: "Stop" }))
      yield* TestHost.settle
      const log = root.log()
      const updates = log.filter((entry) => entry._tag === "Update")
      assert.deepStrictEqual(updates.map((entry) => entry.causedBy), [undefined, undefined, undefined])
      const interrupted = log.filter((entry) => entry._tag === "CommandInterrupted")
      assert.strictEqual(interrupted.length, 1)
      assert.strictEqual(interrupted[0]!.causedBy, updates[2]!.seq)
    })))
})
