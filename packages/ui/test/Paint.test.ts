import {
  Command,
  Component,
  type MessageLog,
  Query,
  Subscription,
  UiSchema
} from "@effect/ui"
import * as runtime from "@effect/ui/internal/runtime"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, type Layer, Schema, Stream } from "effect"
import { AsyncResult } from "effect/reactivity"
import { TestClock } from "effect/testing"

const makeApp = () => {
  const ran = { inits: 0, commands: 0, subscriptions: 0, fetches: 0 }

  class GetName extends Query.Service<GetName>()(
    "GetName",
    {
      args: { id: Schema.String },
      success: Schema.String,
      error: Schema.Never,
      staleTime: 0
    }
  ) {
    static readonly layer = this.toLayer(({ id }) =>
      Effect.sync(() => {
        ran.fetches++
        return id.toUpperCase()
      }).pipe(Effect.delay("10 millis"))
    )
  }

  const RowMessage = UiSchema.TaggedEnum({ Clicked: {}, Ticked: {} })
  const Ping = Command.make("Ping", { args: {} }, () =>
    Effect.sync(() => {
      ran.commands++
      return RowMessage.Ticked()
    }))

  const Row = Component.define({
    name: "Row",
    props: Schema.Struct({ id: Schema.String }),
    model: Schema.Number,
    message: RowMessage,
    queries: {
      name: { query: GetName, args: ({ props }) => ({ id: props.id }) }
    }
  }).make({
    init: ($) => {
      ran.inits++
      return $.set(0).run(Ping.make({}))
    },
    update: ($, message) =>
      RowMessage.match(message, {
        Clicked: () => $.model + 1,
        Ticked: () => $.model
      }),
    view: (h, count) =>
      h.el("button").on("click", RowMessage.Clicked()).children(
        `${h.props.id}:${
          AsyncResult.isSuccess(h.queries.name) ? h.queries.name.value : "?"
        }=${count};`
      ),
    subscriptions: () => [
      Subscription.make(
        "tick",
        Stream.fromEffect(Effect.sync(() => {
          ran.subscriptions++
          return RowMessage.Ticked()
        }))
      )
    ]
  })

  const ListMessage = UiSchema.TaggedEnum({ Added: { id: Schema.String } })
  const List = Component.define({
    name: "List",
    model: Schema.Array(Schema.String),
    message: ListMessage
  }).make({
    init: () => {
      ran.inits++
      return ["a"]
    },
    update: ($, message) => [...$.model, message.id],
    view: (h, ids) =>
      h.el("div", ids.map((id) => Row(h, { key: id, props: { id } })))
  })

  return { ran, List, ListMessage, layer: GetName.layer }
}

const fold = (entries: ReadonlyArray<MessageLog.Entry>) => {
  const state = new Map<string, runtime.PaintState>()
  for (const entry of entries) {
    if (entry._tag === "Mounted" || entry._tag === "Update") {
      state.set(entry.path, { model: entry.model, queries: entry.queries })
    } else if (entry._tag === "QueryChanged") {
      const at = state.get(entry.path)!
      state.set(entry.path, {
        ...at,
        queries: { ...at.queries, [entry.name]: entry.result }
      })
    } else if (entry._tag === "Unmounted") state.delete(entry.path)
  }
  return state
}

const load = TestHost.settle.pipe(
  Effect.andThen(TestClock.adjust("10 millis")),
  Effect.andThen(TestHost.settle)
)

const run = <A, E>(layer: Layer.Layer<any>, effect: Effect.Effect<A, E, any>) =>
  effect.pipe(
    Effect.provide(layer),
    Effect.scoped,
    Effect.provide(TestHost.layer())
  ) as Effect.Effect<A, E>

const click = (container: Locator.Node, text: string) =>
  Locator.fire(
    Locator.get(container, Locator.text(text)) as Locator.Firable,
    "click"
  )

describe("paint", () => {
  it.effect("each instance adopts its state by path, and the painted tree runs, logs and dispatches nothing", () => {
    const { List, ListMessage, layer, ran } = makeApp()
    return run(
      layer,
      Effect.gen(function*() {
        const testHost = yield* TestHost.TestHost
        const root = yield* TestHost.mount(List, {})
        yield* load
        click(root.container, "a:A=0;")
        root.send(ListMessage.Added({ id: "b" }))
        yield* load
        const then = fold(root.log())
        click(root.container, "a:A=1;")
        root.send(ListMessage.Added({ id: "c" }))
        yield* load
        assert.strictEqual(root.text(), "a:A=2;b:B=0;c:C=0;")

        const before = { ...ran }
        const logged = testHost.log.entries().length
        const container = testHost.host.createElement("div")
        const painted = yield* runtime.paint(
          List,
          {},
          container,
          (path) => then.get(path)
        )
        assert.deepStrictEqual(painted.fellBack, [])
        assert.strictEqual(Locator.textOf(container), "a:A=1;b:B=0;")

        assert.throws(
          () => click(container, "a:A=1;"),
          /nothing handles "click"/
        )
        yield* load
        assert.strictEqual(Locator.textOf(container), "a:A=1;b:B=0;")
        assert.strictEqual(root.text(), "a:A=2;b:B=0;c:C=0;")
        assert.deepStrictEqual(ran, before)
        assert.strictEqual(testHost.log.entries().length, logged)
      })
    )
  })

  it.effect("an instance with no recorded state starts from init, and its path is reported", () => {
    const { List, layer, ran } = makeApp()
    return run(
      layer,
      Effect.gen(function*() {
        const testHost = yield* TestHost.TestHost
        const container = testHost.host.createElement("div")
        const painted = yield* runtime.paint(
          List,
          {},
          container,
          (path) => path === "/List" ? { model: ["a", "b"] } : undefined
        )
        yield* load
        assert.deepStrictEqual(painted.fellBack, [
          "/List/Row[a]",
          "/List/Row[b]"
        ])
        assert.strictEqual(Locator.textOf(container), "a:?=0;b:?=0;")
        assert.deepStrictEqual(ran, {
          inits: 2,
          commands: 0,
          subscriptions: 0,
          fetches: 0
        })
      })
    )
  })

  it.effect("an instance with recorded props takes them over the ones its parent's view passes", () => {
    const { List, layer } = makeApp()
    return run(
      layer,
      Effect.gen(function*() {
        const testHost = yield* TestHost.TestHost
        const container = testHost.host.createElement("div")
        const recorded: Record<string, runtime.PaintState> = {
          "/List": { model: ["a", "b"] },
          "/List/Row[a]": { model: 1, props: { id: "before" } },
          "/List/Row[b]": { model: 2 }
        }
        yield* runtime.paint(List, {}, container, (path) => recorded[path])
        assert.strictEqual(Locator.textOf(container), "before:?=1;b:?=2;")
      })
    )
  })

  it.effect("a lazy component that hasn't loaded shows its fallback, without loading it", () =>
    Effect.gen(function*() {
      let loads = 0
      const Page = Component.define({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.text("page")
        })
      const LazyPage = Component.lazy("LazyPage", () => {
        loads++
        return Promise.resolve(Page)
      })
      const App = Component.define({
        name: "App",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            h.el(
              "p",
              LazyPage(h, { props: {}, fallback: () => h.text("loading") })
            )
        })
      const testHost = yield* TestHost.TestHost
      const container = testHost.host.createElement("div")
      yield* runtime.paint(App, {}, container, () => ({ model: null }))
      yield* TestHost.settle
      assert.strictEqual(Locator.textOf(container), "loading")
      assert.strictEqual(loads, 0)
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})
