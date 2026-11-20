import { Command, Component, type MessageLog, Query } from "@effect/ui"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { ConfigProvider, Deferred, Effect, Layer, Schema } from "effect"
import { TestClock } from "effect/testing"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestHost.layer()))

/** A parent that holds a number and shows a child that reads it in `update`. */
const makeApp = () => {
  const views: Array<string> = []
  const ChildMessage = Schema.TaggedUnion({ Read: {} })
  const Child = Component.define({
    name: "Child",
    lifetime: "view",
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
    lifetime: "view",
    model: Schema.Struct({ n: Schema.Number, shown: Schema.Boolean }),
    message: ParentMessage
  }).make({
    init: () => ({ n: 0, shown: true }),
    update: (model, message) => message._tag === "Inc" ? { ...model, n: model.n + 1 } : { ...model, shown: false },
    view: (model, h) => {
      views.push(`parent ${model.n}`)
      return h.el("div").children(model.shown ? Child(h, { key: "child", props: { n: model.n } }) : "gone")
    }
  })
  return { Parent, ParentMessage, views }
}

describe("render timing", () => {
  it.effect(
    "a query's onChange reads new props before the flush",
    () => {
      class GetName extends Query.Service<GetName>()(
        "test/GetName",
        { args: {}, success: Schema.String, error: Schema.Never, staleTime: "30 seconds" },
        Effect.succeed(() => Effect.as(Effect.sleep("10 millis"), "Ann"))
      ) {}
      const ReaderMessage = Schema.TaggedUnion({ Named: {} })
      const Reader = Component.define({
        name: "Reader",
        lifetime: "view",
        props: Schema.Struct({ n: Schema.Number }),
        model: Schema.Number,
        message: ReaderMessage,
        queries: { name: { query: GetName, args: () => ({}), onChange: () => ReaderMessage.make({ _tag: "Named" }) } }
      }).make({
        init: () => -1,
        update: (_model, _message, $) => $.props.n,
        view: (model, h) => h.el("i").children(`${h.props.n}/${model}`)
      })
      const Holder = Component.define({ name: "Holder", lifetime: "view", model: Schema.Number, message: Schema.Null })
        .make({
          init: () => 0,
          update: (model) => model + 1,
          view: (model, h) => h.el("div").children(Reader(h, { key: "reader", props: { n: model } }))
        })
      return Effect.gen(function*() {
        const root = yield* TestHost.mount(Holder, {})
        yield* TestHost.settle
        root.send(null)
        // The fetch ends, and its result is written, in the clock's wake: before the flush when none ran.
        yield* TestClock.adjust("10 millis")
        yield* TestHost.settle
        assert.strictEqual(root.text(), "1/1")
      }).pipe(Effect.provide(GetName.layer), Effect.provide(TestHost.layer({ flush: "last" })))
    }
  )

  it.effect("a query fetches the args of every Model before the flush", () => {
    class GetNumber extends Query.Service<GetNumber>()(
      "test/GetNumber",
      { args: { n: Schema.Number }, success: Schema.Number, error: Schema.Never, staleTime: "30 seconds" },
      Effect.succeed(({ n }) => Effect.as(Effect.sleep("10 millis"), n))
    ) {}
    const Again = Command.make("Again", { args: {} }, () => Effect.succeed("again" as const))
    const Counter = Component.define({
      name: "Counter",
      lifetime: "view",
      model: Schema.Number,
      message: Schema.Literals(["click", "again"]),
      queries: { number: { query: GetNumber, args: (model: number) => ({ n: model }) } }
    }).make({
      init: () => 0,
      // The Command's result arrives before the flush or after it.
      update: (model, message, $) => message === "click" ? $.set(model + 1).run(Again({})) : model + 1,
      view: (model, h) => h.el("button").on("click", "click").children(String(model))
    })
    return Effect.gen(function*() {
      const root = yield* TestHost.mount(Counter, {})
      yield* TestHost.settle
      Locator.fire(root.get(Locator.tag("button")), "click")
      yield* TestHost.settle
      assert.deepStrictEqual(root.fetches().map((fetch) => fetch.logKey), ["{\"n\":0}", "{\"n\":1}", "{\"n\":2}"])
    }).pipe(Effect.provide(GetNumber.layer), Effect.provide(TestHost.layer({ flush: "last" })))
  })

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
      const App = Component.define({ name: "App", lifetime: "view", model: Schema.String, message: Message }).make({
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

describe("TestHost.formatTimeline", () => {
  it.effect("lists each fact with what followed from it under it, whichever flush logged it", () =>
    provideHost(Effect.gen(function*() {
      const app = makeApp()
      const root = yield* TestHost.mount(app.Parent, {})
      yield* TestHost.settle
      const from = root.log().length
      const button = root.get(Locator.tag("button"))
      root.send(app.ParentMessage.make({ _tag: "Inc" }))
      Locator.fire(button, "click")
      root.send(app.ParentMessage.make({ _tag: "Hide" }))
      Locator.fire(button, "click")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "gone")
      const first = root.log()[from]!.seq
      assert.strictEqual(
        TestHost.formatTimeline(root.log().slice(from)),
        [
          `#${first} /Parent Update Inc (dispatch)`,
          `    #${first + 1} /Parent/Child[child] PropsChanged`,
          `#${first + 2} /Parent/Child[child] Update Read (dom click)`,
          `#${first + 3} /Parent Update Hide (dispatch)`,
          `    #${first + 4} /Parent/Child[child] Unmounted`
        ].join("\n")
      )
    })))

  it.effect("an entry whose fact isn't among the entries is listed as one, naming it", () =>
    provideHost(Effect.gen(function*() {
      const app = makeApp()
      const root = yield* TestHost.mount(app.Parent, {})
      yield* TestHost.settle
      const log = root.log()
      assert.strictEqual(
        TestHost.formatTimeline(log.slice(1, 3)),
        [
          `#${log[1]!.seq} /Parent Mounted (after #${log[0]!.seq})`,
          `#${log[2]!.seq} /Parent/Child[child] Mounted (after #${log[0]!.seq})`
        ].join("\n")
      )
    })))
})

describe("TestHost.layer flush", () => {
  // A click's update issues a Command whose result is a second message: the render the click asked
  // for runs before the Command's fiber or after it.
  const views = (host: Layer.Layer<TestHost.TestHost>) => {
    let count = 0
    const Again = Command.make("Again", { args: {} }, () => Effect.succeed("again" as const))
    const Counter = Component.define({
      name: "Counter",
      lifetime: "view",
      model: Schema.Number,
      message: Schema.Literals(["click", "again"])
    }).make({
      init: () => 0,
      update: (model, message, $) => message === "click" ? $.set(model + 1).run(Again({})) : model + 1,
      view: (model, h) => {
        count++
        return h.el("button").on("click", "click").children(String(model))
      }
    })
    return Effect.gen(function*() {
      const root = yield* TestHost.mount(Counter, {})
      yield* TestHost.settle
      count = 0
      Locator.fire(root.get(Locator.tag("button")), "click")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "2")
      return count
    }).pipe(Effect.provide(host))
  }
  const env = (value: string) => ConfigProvider.layer(ConfigProvider.fromEnv({ env: { EFFECT_UI_TEST_FLUSH: value } }))

  it.effect("first renders before the scheduler's other tasks, and last after them", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* views(TestHost.layer({ flush: "first" })), 2)
      assert.strictEqual(yield* views(TestHost.layer({ flush: "last" })), 1)
    }))

  it.effect("a seed gives the same order every time", () =>
    Effect.gen(function*() {
      const host = TestHost.layer({ flush: { seed: 1 } })
      assert.strictEqual(yield* views(host), yield* views(host))
    }))

  it.effect("EFFECT_UI_TEST_FLUSH sets it when the option is unset", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* views(TestHost.layer().pipe(Layer.provide(env("first")))), 2)
      assert.strictEqual(yield* views(TestHost.layer().pipe(Layer.provide(env("last")))), 1)
      assert.strictEqual(yield* views(TestHost.layer({ flush: "first" }).pipe(Layer.provide(env("last")))), 2)
    }))
})
