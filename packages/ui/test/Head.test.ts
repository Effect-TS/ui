import { Component, Head, type MessageLog } from "@effect/ui"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Tiny } from "./fixtures/vocabulary.ts"

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

  it("rejects siblings without distinct paths, in either order", () => {
    const at = (path: string | undefined, title: string): Head.Tree => ({ path, ...node([Head.title(title)]) })
    const pairs = [[undefined, undefined], [undefined, ""], ["/App/Page", "/App/Page"]] as const
    for (const [first, second] of pairs) {
      const a = at(first, "A")
      const b = at(second, "B")
      const message = first === undefined ? /two siblings have no path/ : /two siblings share the path \/App\/Page/
      assert.throws(() => Head.merge(node([], a, b)), message)
      assert.throws(() => Head.merge(node([], b, a)), message)
    }
    assert.strictEqual(Head.merge(node([], at(undefined, "A"), node([]))).title, "A")
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
        model: Schema.Boolean,
        message: Schema.Boolean
      }).make({
        init: () => false,
        update: (_, broken) => broken,
        head: (broken) => [
          Head.titleTemplate((title) => {
            if (broken) throw new Error("bad template")
            return `${title} · App`
          })
        ],
        view: (_, h) => Page(h, { key: "page", props: {} })
      })
      const root = yield* TestHost.mount(App, {}, { fallback: (_, h) => h.text("down") })
      yield* TestHost.settle
      assert.deepStrictEqual(root.head() as unknown, { title: "Ada · App" })
      root.send(true)
      const crashed = yield* Effect.flip(TestHost.settle)
      assert.strictEqual(crashed._tag, "RootCrashed")
      assert.strictEqual(root.text(), "down")
      // The failed root and the page under it contribute nothing: the title it had goes.
      assert.deepStrictEqual(root.head(), { title: undefined })
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("a vocabulary's own fold gets every instance, headless ones included, in document order", () =>
    Effect.gen(function*() {
      interface Shape {
        readonly path: string | undefined
        readonly entries: ReadonlyArray<string>
        readonly children: ReadonlyArray<Shape>
      }
      const shape = (tree: Head.Tree<{ readonly _tag: string }, unknown>): Shape => ({
        path: tree.path,
        entries: tree.entries.map((entry) => entry._tag),
        children: tree.children.map(shape)
      })
      // The fold's value is the shape of the tree it was given.
      const Shaped = { ...Tiny, head: { merge: shape, title: () => undefined } }
      const leaf = (name: string, head?: ReadonlyArray<Head.Entry>) =>
        Component.define({ name, model: Schema.Null, message: Schema.Never, elements: Shaped }).make({
          init: () => null,
          update: (model) => model,
          head: head === undefined ? undefined : () => head,
          view: (_, h) => h.label(name)
        })
      const Page = leaf("Page", [Head.title("Page")])
      const Aside = leaf("Aside")
      const Note = leaf("Note")
      /** No head and no reduceHead of its own. */
      const holding = (name: string, ...children: ReadonlyArray<readonly [string, ReturnType<typeof leaf>]>) =>
        Component.define({ name, model: Schema.Null, message: Schema.Never, elements: Shaped }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.box(...children.map(([key, child]) => child(h, { key, props: {} })))
        })
      // One with a child that has a head, and one with nothing that has a head anywhere below it.
      const Layout = holding("Layout", ["page", Page], ["aside", Aside])
      const Footer = holding("Footer", ["note", Note])
      const App = holding("App", ["layout", Layout], ["footer", Footer])
      const root = yield* TestHost.mount(App, {})
      yield* TestHost.settle
      const leafAt = (path: string, entries: ReadonlyArray<string> = []): Shape => ({ path, entries, children: [] })
      assert.deepStrictEqual(root.head() as unknown, {
        path: "/App",
        entries: [],
        children: [
          {
            path: "/App/Layout[layout]",
            entries: [],
            children: [leafAt("/App/Layout[layout]/Page[page]", ["Title"]), leafAt("/App/Layout[layout]/Aside[aside]")]
          },
          { path: "/App/Footer[footer]", entries: [], children: [leafAt("/App/Footer[footer]/Note[note]")] }
        ]
      })
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

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
  const ordered = <A>(swapped: boolean, a: A, b: A): readonly [A, A] => swapped ? [b, a] : [a, b]

  it.effect("siblings that set different titles leave it unset and are reported, in either order", () =>
    Effect.gen(function*() {
      const App = Component.define({
        name: "App",
        props: Schema.Struct({ swapped: Schema.Boolean }),
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: (model) => model,
        head: () => [Head.title("App")],
        view: (_, h) =>
          h.el(
            "main",
            ...ordered(
              h.props.swapped,
              Titled(h, { key: "first", props: { title: "First" } }),
              Titled(h, { key: "second", props: { title: "Second" } })
            )
          )
      })
      const roots = [yield* TestHost.mount(App, { swapped: false }), yield* TestHost.mount(App, { swapped: true })]
      const conflicts = yield* TestHost.expectProblem("HeadConflict")
      const paths = ["/App/Titled[first]", "/App/Titled[second]"]
      assert.deepStrictEqual(conflicts.map((conflict) => (conflict as Head.Conflict).paths), [paths, paths])
      yield* TestHost.settle
      assert.deepStrictEqual(roots.map((root) => root.head().title), [undefined, undefined])
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})
