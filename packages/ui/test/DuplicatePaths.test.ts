import { Component, type MessageLog, UiSchema } from "@effect/ui"
import { Locator, Scene, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(TestHost.layer()))

const Row = Component.define({
  name: "Row",
  props: Schema.Struct({ label: Schema.String }),
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.el("li", h.props.label)
})

const ListMessage = UiSchema.TaggedEnum({
  Set: { keys: Schema.Array(Schema.String) }
})

/** Renders a `Row` per key, either as siblings or each under its own element. */
const makeList = (layout: "siblings" | "nested") =>
  Component.define({
    name: "List",
    props: Schema.Struct({ keys: Schema.Array(Schema.String) }),
    model: Schema.Array(Schema.String),
    message: ListMessage
  }).make({
    init: ($) => $.props.keys,
    update: (_, message) => message.keys,
    view: (h, keys) =>
      layout === "siblings"
        ? h.el("ul", keys.map((key) => Row(h, { key, props: { label: key } })))
        : h.el(
          "div",
          keys.map((key) => h.el("ul", Row(h, { key, props: { label: key } })))
        )
  })

/** Holds the list as a child with a fallback, so the list's failure shows instead of crashing the root. */
const makePage = (layout: "siblings" | "nested") => {
  const List = makeList(layout)
  return Component.define({
    name: "Page",
    props: Schema.Struct({ keys: Schema.Array(Schema.String) }),
    model: Schema.Null,
    message: Schema.Never
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
      h.el(
        "main",
        List(
          h,
          {
            key: "l",
            props: { keys: h.props.keys },
            fallback: () => h.text("failed")
          }
        )
      )
  })
}

const failure = (log: ReadonlyArray<MessageLog.Entry>) => {
  const failed = log.filter((entry): entry is MessageLog.Failed =>
    entry._tag === "Failed"
  )
  assert.strictEqual(failed.length, 1)
  return failed[0]
}

describe("duplicate child paths", () => {
  for (const layout of ["siblings", "nested"] as const) {
    it.effect(`fail the parent on its first render, for ${layout}`, () =>
      provideHost(Effect.gen(function*() {
        const root = yield* TestHost.mount(makePage(layout), {
          keys: ["a", "b", "a"]
        })
        yield* TestHost.settle
        assert.strictEqual(root.text(), "failed")
        const failed = failure(root.log())
        assert.strictEqual(failed.path, "/Page/List[l]")
        assert.strictEqual(failed.in, "view")
        assert.include(
          Cause.pretty(failed.cause),
          "/Page/List[l] renders two children at Row[a]"
        )
        // No row of the failed list stays mounted.
        assert.deepStrictEqual(
          root.log().filter((entry) => entry._tag === "Mounted").map((entry) =>
            entry.path
          ),
          ["/Page", "/Page/List[l]"]
        )
      })))

    it.effect(`fail the parent on a re-render, for ${layout}`, () =>
      provideHost(Effect.gen(function*() {
        const root = yield* TestHost.mount(makeList(layout), {
          keys: ["a", "b"]
        }, {
          fallback: (_, h) => h.text("crashed")
        })
        yield* TestHost.settle
        assert.strictEqual(root.text(), "ab")
        root.send(ListMessage.Set({ keys: ["a", "b", "b"] }))
        const crashed = yield* Effect.flip(TestHost.settle)
        assert.strictEqual(crashed._tag, "RootCrashed")
        assert.strictEqual(root.text(), "crashed")
        const failed = failure(root.log())
        assert.strictEqual(failed.in, "view")
        assert.include(
          Cause.pretty(failed.cause),
          "/List renders two children at Row[b]"
        )
      })))
  }

  // A row `h.lazy` gives again is the same node as last time: the one that holds a child still takes its path.
  for (
    const [what, row, keys] of [
      [
        "holds a child",
        (h: any) => h.el("li", Row(h, { key: "a", props: { label: "a" } })),
        ["a"]
      ],
      ["holds none", (h: any) => h.el("li", "x"), ["a", "a"]]
    ] as const
  ) {
    it.effect(`fail the parent on a re-render beside a row h.lazy gives again that ${what}`, () =>
      provideHost(Effect.gen(function*() {
        const List = Component.define({
          name: "List",
          model: Schema.Array(Schema.String),
          message: ListMessage
        }).make({
          init: () => [],
          update: (_, message) => message.keys,
          view: (h, keys) =>
            h.el(
              "ul",
              h.lazy(row),
              keys.map((key) => Row(h, { key, props: { label: key } }))
            )
        })
        const root = yield* TestHost.mount(List, {}, {
          fallback: (_, h) => h.text("crashed")
        })
        yield* TestHost.settle
        root.send(ListMessage.Set({ keys }))
        const crashed = yield* Effect.flip(TestHost.settle)
        assert.strictEqual(crashed._tag, "RootCrashed")
        assert.include(
          Cause.pretty(failure(root.log()).cause),
          "/List renders two children at Row[a]"
        )
      })))
  }

  it.effect("never give a key holding ]/ the path of a grandchild", () =>
    provideHost(Effect.gen(function*() {
      const Group = makeList("siblings")
      const Page = Component.define({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.el(
            "main",
            Group(h, { key: "a", props: { keys: ["b"] } }),
            Group(h, { key: "a]/Row[b", props: { keys: [] } })
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.deepStrictEqual(
        root.log().filter((entry) => entry._tag === "Mounted").map((entry) =>
          entry.path
        ),
        [
          "/Page",
          "/Page/List[a]",
          "/Page/List[a]/Row[b]",
          "/Page/List[a]%2FRow[b]"
        ]
      )
    })))

  it("fail a Scene step whose view renders two children at one path", () => {
    const steps = Scene.start(makeList("nested"), { keys: ["a"] })
    assert.lengthOf(Scene.children(steps.current.view()), 1)
    // Nothing in the view sends `Set`, so the scene starts from the Model it makes.
    assert.throws(
      () => steps.given(["a", "a"]),
      /\/List renders two children at Row\[a\]/
    )
    assert.throws(
      () => Scene.start(makeList("siblings"), { keys: ["b", "b"] }),
      /\/List renders two children at Row\[b\]/
    )
  })

  describe("in a child's fallback", () => {
    const Broken = Component.define({
      name: "Broken",
      model: Schema.Null,
      message: Schema.Never
    }).make({
      init: () => {
        throw new Error("broken")
      },
      update: ($) => $.model,
      view: (h) => h.text("")
    })

    const Props = Schema.Struct({
      siblings: Schema.Array(Schema.String),
      first: Schema.Array(Schema.String),
      second: Schema.Array(Schema.String)
    })
    type Props = typeof Props.Type
    const ParentMessage = UiSchema.TaggedEnum({ Bump: {} })

    /**
     * A `Row` per sibling key, then two `Broken` children, `b` and `c`, whose
     * fallbacks show a `Row` per `first` and `second` key, each under its own
     * element. `Bump` re-renders it.
     */
    const Parent = Component.define({
      name: "Parent",
      props: Props,
      model: Schema.Number,
      message: ParentMessage
    })
      .make({
        init: () => 0,
        update: ($) => $.model + 1,
        view: (h) => {
          const rows = (keys: ReadonlyArray<string>) =>
            h.el(
              "div",
              keys.map((key) =>
                h.el("p", Row(h, { key, props: { label: key } }))
              )
            )
          return h.el(
            "div",
            h.props.siblings.map((key) =>
              Row(h, { key, props: { label: key } })
            ),
            Broken(h, { key: "b", fallback: () => rows(h.props.first) }),
            Broken(h, { key: "c", fallback: () => rows(h.props.second) })
          )
        }
      })

    const Root = Component.define({
      name: "Root",
      props: Props,
      model: Schema.Null,
      message: Schema.Never
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Parent(h, {
          key: "p",
          props: h.props,
          fallback: () => h.text("parent-failed")
        })
    })

    const cases: ReadonlyArray<
      Props & { readonly name: string; readonly error: string }
    > = [
      {
        name: "two children at one path",
        siblings: [],
        first: ["a", "a"],
        second: [],
        error: "renders two children at Row[a], in the fallback of Broken[b]"
      },
      {
        name: "a child at a sibling child's path",
        siblings: ["a"],
        first: ["a"],
        second: [],
        error: "renders two children at Row[a], in the fallback of Broken[b]"
      },
      {
        name: "a child at the path of another fallback's child",
        siblings: [],
        first: ["a"],
        second: ["a"],
        error: "renders two children at Row[a], in the fallback of Broken[c]"
      }
    ]
    for (const { error, name, ...props } of cases) {
      it.effect(`fail the parent with source view when a fallback renders ${name}`, () =>
        provideHost(Effect.gen(function*() {
          const root = yield* TestHost.mount(Root, props)
          yield* TestHost.settle
          assert.strictEqual(root.text(), "parent-failed")
          const failed = root.log().filter((
            entry
          ): entry is MessageLog.Failed =>
            entry._tag === "Failed" && entry.path === "/Root/Parent[p]"
          )
          assert.lengthOf(failed, 1)
          assert.strictEqual(failed[0].in, "view")
          assert.include(
            Cause.pretty(failed[0].cause),
            `/Root/Parent[p] ${error}`
          )
        })))
    }

    it.effect("mount the fallbacks' children when their paths are free, render after render", () =>
      provideHost(Effect.gen(function*() {
        const root = yield* TestHost.mount(Parent, {
          siblings: ["a"],
          first: ["b"],
          second: ["c", "d"]
        })
        yield* TestHost.settle
        assert.strictEqual(root.text(), "abcd")
        root.send(ParentMessage.Bump())
        yield* TestHost.settle
        assert.strictEqual(root.text(), "abcd")
        assert.isFalse(
          root.log().some((entry) =>
            entry._tag === "Failed" && entry.path === "/Parent"
          )
        )
      })))

    it.effect("fail the parent when a child that fails after it rendered shows a fallback at a sibling's path", () =>
      provideHost(Effect.gen(function*() {
        const Faulty = Component.define({
          name: "Faulty",
          model: Schema.Null,
          message: Schema.Null
        })
          .make({
            init: () => null,
            update: () => {
              throw new Error("faulty")
            },
            view: (h) => h.el("button").on("click", null).children("faulty")
          })
        const Page = Component.define({
          name: "Page",
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            h.el(
              "div",
              Row(h, { key: "a", props: { label: "a" } }),
              Faulty(h, {
                key: "f",
                fallback: () => Row(h, { key: "a", props: { label: "a" } })
              })
            )
        })
        const root = yield* TestHost.mount(Page, {}, {
          fallback: (_, h) => h.text("page-failed")
        })
        yield* TestHost.settle
        Locator.fire(root.get(Locator.text("faulty", { exact: true })), "click")
        assert.strictEqual(
          (yield* Effect.flip(TestHost.settle))._tag,
          "RootCrashed"
        )
        assert.strictEqual(root.text(), "page-failed")
        const failed = root.log().filter((entry): entry is MessageLog.Failed =>
          entry._tag === "Failed" && entry.path === "/Page"
        )
        assert.lengthOf(failed, 1)
        assert.include(
          Cause.pretty(failed[0].cause),
          "renders two children at Row[a], in the fallback of Faulty[f]"
        )
      })))

    it("fail Scene.fallback the same way", () => {
      const view = Scene.start(Parent, {
        siblings: ["a"],
        first: ["a"],
        second: []
      }).current.view()
      assert.throws(
        () =>
          Scene.fallback(
            view,
            Broken,
            "b",
            AsyncResult.failure(Cause.fail("broken"))
          ),
        /Scene\.fallback renders two children at Row\[a\], in the fallback of Broken\[b\]/
      )
      assert.isDefined(
        Scene.fallback(
          Scene.start(Parent, { siblings: ["a"], first: ["b"], second: [] })
            .current.view(),
          Broken,
          "b",
          AsyncResult.failure(Cause.fail("broken"))
        )
      )
    })
  })

  describe("in a nested fallback", () => {
    const Broken = Component.define({
      name: "Broken",
      model: Schema.Null,
      message: Schema.Never
    }).make({
      init: () => {
        throw new Error("broken")
      },
      update: ($) => $.model,
      view: (h) => h.text("")
    })

    const Go = UiSchema.TaggedEnum({ Go: {} })
    /** Named `Row`, so its fallback can show a `Row` at its own path. Fails on a click. */
    const Faulty = Component.define({
      name: "Row",
      model: Schema.Null,
      message: Go
    }).make({
      init: () => null,
      update: () => {
        throw new Error("faulty")
      },
      view: (h) => h.el("button").on("click", Go.Go()).children("faulty")
    })
    const Props = Schema.Struct({ nested: Schema.Array(Schema.String) })
    const ParentMessage = UiSchema.TaggedEnum({ Bump: {} })

    /**
     * `Broken[b]`'s fallback shows `Faulty` at `Row[a]`, and `Faulty`'s
     * fallback shows a `Row` per `nested` key.
     */
    const Parent = Component.define({
      name: "Parent",
      props: Props,
      model: Schema.Number,
      message: ParentMessage
    })
      .make({
        init: () => 0,
        update: ($) => $.model + 1,
        view: (h) =>
          Broken(h, {
            key: "b",
            fallback: () => {
              const rows = () =>
                h.el(
                  "ul",
                  h.props.nested.map((key) =>
                    Row(h, { key, props: { label: key } })
                  )
                )
              return Faulty(h, { key: "a", fallback: rows })
            }
          })
      })

    const Root = Component.define({
      name: "Root",
      props: Props,
      model: Schema.Null,
      message: Schema.Never
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Parent(h, {
          key: "p",
          props: h.props,
          fallback: () => h.text("parent-failed")
        })
    })

    const parentFailures = (root: TestHost.TestRoot<null, never, never>) =>
      root.log().filter((entry): entry is MessageLog.Failed =>
        entry._tag === "Failed" && entry.path === "/Root/Parent[p]"
      )

    it.effect("let a failed child's fallback reuse the child's own key, render after render", () =>
      provideHost(Effect.gen(function*() {
        const root = yield* TestHost.mount(Parent, { nested: ["a"] })
        yield* TestHost.settle
        assert.strictEqual(root.text(), "faulty")
        Locator.fire(root.get(Locator.text("faulty", { exact: true })), "click")
        yield* TestHost.settle
        assert.strictEqual(root.text(), "a")
        root.send(ParentMessage.Bump())
        yield* TestHost.settle
        assert.strictEqual(root.text(), "a")
        assert.isFalse(
          root.log().some((entry) =>
            entry._tag === "Failed" && entry.path === "/Parent"
          )
        )
      })))

    it.effect("fail the parent when a nested fallback renders two children with one key", () =>
      provideHost(Effect.gen(function*() {
        const root = yield* TestHost.mount(Root, { nested: ["a", "a"] })
        yield* TestHost.settle
        Locator.fire(root.get(Locator.text("faulty", { exact: true })), "click")
        yield* TestHost.settle
        assert.strictEqual(root.text(), "parent-failed")
        const failed = parentFailures(root)
        assert.lengthOf(failed, 1)
        assert.strictEqual(failed[0].in, "view")
        assert.include(
          Cause.pretty(failed[0].cause),
          "/Root/Parent[p] renders two children at Row[a], in the fallback of Row[a]"
        )
      })))
  })
})

describe("a child without a key", () => {
  it.effect("mounts at Name[], one per component", () =>
    provideHost(Effect.gen(function*() {
      const Label = Component.define({
        name: "Label",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.el("span", "label")
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.el("main", Row(h, { props: { label: "row" } }), Label(h, {}))
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "rowlabel")
      assert.deepStrictEqual(
        root.log().filter((entry) => entry._tag === "Mounted").map((entry) =>
          entry.path
        ),
        ["/Page", "/Page/Row[]", "/Page/Label[]"]
      )
    })))

  it.effect("in a list fails the parent once a second row renders, asking for a key", () =>
    provideHost(Effect.gen(function*() {
      const List = Component.define({
        name: "List",
        props: Schema.Struct({ keys: Schema.Array(Schema.String) }),
        model: Schema.Array(Schema.String),
        message: ListMessage
      }).make({
        init: ($) => $.props.keys,
        update: (_, message) => message.keys,
        view: (h, keys) =>
          h.el("ul", keys.map((key) => Row(h, { props: { label: key } })))
      })
      const root = yield* TestHost.mount(List, { keys: ["a"] }, {
        fallback: (_, h) => h.text("crashed")
      })
      yield* TestHost.settle
      assert.strictEqual(root.text(), "a")
      root.send(ListMessage.Set({ keys: ["a", "b"] }))
      yield* Effect.flip(TestHost.settle)
      assert.strictEqual(root.text(), "crashed")
      assert.include(
        Cause.pretty(failure(root.log()).cause),
        "/List renders two children at Row[]. A child without a key must be the only Row where it is rendered: " +
          "give each Row its own `key`"
      )
    })))
})
