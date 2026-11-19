import { Component, Head, type MessageLog, UiSchema } from "@effect/ui"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const node = (
  entries: ReadonlyArray<Head.Entry>,
  ...children: ReadonlyArray<Head.Tree>
): Head.Tree => ({ entries, children })

describe("Head", () => {
  it("chains title templates outward, never on the instance's own title", () => {
    const app = (layout: Head.Tree) => node([Head.titleTemplate((t) => `${t} · App`), Head.title("App")], layout)
    const people = (...children: ReadonlyArray<Head.Tree>) =>
      node([Head.titleTemplate((t) => `${t} · People`), Head.title("People")], ...children)
    assert.strictEqual(Head.merge(app(people(node([Head.title("Ada")])))).title, "Ada · People · App")
    assert.strictEqual(Head.merge(app(people())).title, "People · App")
    assert.strictEqual(Head.merge(node([Head.titleTemplate((t) => `${t}!`), Head.title("Root")])).title, "Root")
  })

  it("skips a throwing template and reports it to its node", () => {
    const errors: Array<unknown> = []
    const tree: Head.Tree = {
      entries: [Head.titleTemplate(() => {
        throw new Error("bad template")
      })],
      children: [node([Head.title("Ada")])],
      onError: (error) => errors.push(error)
    }
    assert.strictEqual(Head.merge(tree).title, "Ada")
    assert.strictEqual(errors.length, 1)
    assert.throws(() => Head.merge({ ...tree, onError: undefined }), /bad template/)
  })

  it("reports two siblings that set the title, and the later one wins", () => {
    const conflicts: Array<Head.Conflict> = []
    const head = Head.merge(
      {
        path: "/App",
        entries: [Head.titleTemplate((title) => `${title} · App`), Head.title("App")],
        children: [
          { path: "/App/A[a]", entries: [Head.title("A")], children: [] },
          {
            path: "/App/B[b]",
            entries: [],
            children: [{ path: "/App/B[b]/C[c]", entries: [Head.title("C")], children: [] }]
          }
        ]
      },
      { onConflict: (conflict) => conflicts.push(conflict) }
    )
    assert.strictEqual(head.title, "C · App")
    assert.deepStrictEqual(conflicts.map((conflict) => [conflict._tag, conflict.slot, conflict.paths]), [
      ["HeadConflict", "title", ["/App/A[a]", "/App/B[b]/C[c]"]]
    ])
    // A descendant overriding its ancestor's title isn't a conflict.
    conflicts.length = 0
    Head.merge(
      {
        path: "/A",
        entries: [Head.title("A")],
        children: [{ path: "/A/B", entries: [Head.title("B")], children: [] }]
      },
      { onConflict: (conflict) => conflicts.push(conflict) }
    )
    assert.deepStrictEqual(conflicts, [])
  })

  it("applies each node's reduce bottom up, over its entries and its children's values", () => {
    const head = Head.merge({
      entries: [],
      reduce: (below) => ({ title: `[${below.title}]` }),
      children: [{
        entries: [Head.title("Inner")],
        reduce: (below) => ({ title: below.title?.toUpperCase() }),
        children: []
      }]
    })
    assert.strictEqual(head.title, "[INNER]")
  })

  it.effect("fails only the instance whose title template throws", () =>
    Effect.gen(function*() {
      const Page = Component.define({
        name: "Page",
        model: Schema.Number,
        message: Schema.Never
      }).make({
        init: () => 0,
        update: (model) => model,
        head: () => [Head.title("Ada")],
        view: (_, h) => h.text("page")
      })
      const Layout = Component.define({
        name: "Layout",
        model: Schema.Number,
        message: Schema.Never
      }).make({
        init: () => 0,
        update: (model) => model,
        head: () => [
          Head.titleTemplate(() => {
            throw new Error("bad template")
          })
        ],
        view: (_, h) => Page(h, { key: "page", props: {} })
      })
      const App = Component.define({
        name: "App",
        model: Schema.Number,
        message: Schema.Never
      }).make({
        init: () => 0,
        update: (model) => model,
        head: () => [Head.title("App")],
        view: (_, h) => h.el("main", Layout(h, { key: "layout", props: {}, fallback: () => h.text("down") }))
      })
      const root = yield* TestHost.mount(App, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
      assert.strictEqual(root.head().title, "App")
      const failed = root.log().filter((entry): entry is MessageLog.Failed => entry._tag === "Failed")
      assert.deepStrictEqual(failed.map((entry) => [entry.path, entry.in]), [["/App/Layout[layout]", "head"]])
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("clears the head when the root's title template throws", () =>
    Effect.gen(function*() {
      const Page = Component.define({
        name: "Page",
        model: Schema.Number,
        message: Schema.Never
      }).make({
        init: () => 0,
        update: (model) => model,
        head: () => [Head.title("Ada")],
        view: (_, h) => h.text("page")
      })
      const App = Component.define({
        name: "App",
        model: Schema.Number,
        message: Schema.Never
      }).make({
        init: () => 0,
        update: (model) => model,
        head: () => [
          Head.titleTemplate(() => {
            throw new Error("bad template")
          })
        ],
        view: (_, h) => Page(h, { key: "page", props: {} })
      })
      const root = yield* TestHost.mount(App, {}, { fallback: (_, h) => h.text("down") })
      const crashed = yield* Effect.flip(TestHost.settle)
      assert.strictEqual(crashed._tag, "RootCrashed")
      assert.strictEqual(root.text(), "down")
      // The failed root and the page under it contribute nothing.
      assert.deepStrictEqual(root.head(), { title: undefined })
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("head gets the props, and follows a props-only change", () =>
    Effect.gen(function*() {
      const Page = Component.define({
        name: "Page",
        props: Schema.Struct({ id: Schema.String }),
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: (model) => model,
          head: (_model, props) => [Head.title(`Note ${props.id}`)],
          view: (_, h) => h.text(h.props.id)
        })
      const App = Component.define({ name: "App", model: Schema.String, message: Schema.String }).make({
        init: () => "a",
        update: (_, id) => id,
        view: (id, h) => Page(h, { key: "page", props: { id } })
      })
      const root = yield* TestHost.mount(App, {})
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "Note a")
      root.send("b")
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "Note b")
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  it.effect("a component with a head that mounts after the first render sets it, and unmounting clears it", () =>
    Effect.gen(function*() {
      const Page = Component.define({ name: "Page", model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        head: () => [Head.title("Page")],
        view: (_, h) => h.text("page")
      })
      const App = Component.define({ name: "App", model: Schema.Boolean, message: Schema.Boolean }).make({
        init: () => false,
        update: (_, shown) => shown,
        view: (shown, h) => h.el("main", shown ? Page(h, { key: "page", props: {} }) : "none")
      })
      const root = yield* TestHost.mount(App, {})
      yield* TestHost.settle
      assert.strictEqual(root.head().title, undefined)
      root.send(true)
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "Page")
      root.send(false)
      yield* TestHost.settle
      assert.strictEqual(root.head().title, undefined)
      root.send(true)
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "Page")
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  it.effect("a component placed in a child's fallback contributes its head", () =>
    Effect.gen(function*() {
      const Notice = Component.define({ name: "Notice", model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        head: () => [Head.title("Unavailable")],
        view: (_, h) => h.text("unavailable")
      })
      const Broken = Component.define({ name: "Broken", model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        head: () => [Head.title("Broken")],
        view: (): never => {
          throw new Error("view")
        }
      })
      const App = Component.define({ name: "App", model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        head: () => [Head.titleTemplate((title) => `${title} · App`)],
        view: (_, h) =>
          h.el("main", Broken(h, { key: "b", props: {}, fallback: () => Notice(h, { key: "n", props: {} }) }))
      })
      const root = yield* TestHost.mount(App, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "unavailable")
      assert.strictEqual(root.head().title, "Unavailable · App")
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  it.effect("reports siblings that set the title to Query.Problems with both paths, and applies the later one", () =>
    Effect.gen(function*() {
      const Titled = Component.define({
        name: "Titled",
        props: Schema.Struct({ title: Schema.String }),
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: (model) => model,
        head: (_, props) => [Head.title(props.title)],
        view: (_, h) => h.text(h.props.title)
      })
      const App = Component.define({ name: "App", model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) =>
          h.el(
            "main",
            Titled(h, { key: "first", props: { title: "First" } }),
            Titled(h, { key: "second", props: { title: "Second" } })
          )
      })
      const root = yield* TestHost.mount(App, {})
      const [conflict] = yield* TestHost.expectProblem("HeadConflict")
      assert.deepStrictEqual((conflict as Head.Conflict).paths, ["/App/Titled[first]", "/App/Titled[second]"])
      assert.strictEqual((conflict as Head.Conflict).slot, "title")
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "Second")
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  it.effect("reduceHead maps the folded head of the instance and what it placed, and the root's result is final", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({ Shout: {} })
      const Page = Component.define({ name: "Page", model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        head: () => [Head.title("page")],
        view: (_, h) => h.text("page")
      })
      const App = Component.define({ name: "App", model: Schema.Boolean, message: Message }).make({
        init: () => false,
        update: () => true,
        reduceHead: (loud, below) => loud ? { title: below.title?.toUpperCase() } : below,
        view: (_, h) => h.el("main", Page(h, { key: "page", props: {} }))
      })
      const root = yield* TestHost.mount(App, {})
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "page")
      root.send(Message.Shout())
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "PAGE")
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})
