// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Dialog, DialogEvents, Item, Menu } from "./fixtures/headless.ts"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(TestHost.layer()))

const element = (
  root: TestHost.TestRoot<unknown, never, unknown>,
  text: string
) => root.get(Locator.text(text, { exact: true })) as TestHost.TestElement

const updates = (root: TestHost.TestRoot<unknown, never, unknown>) =>
  root.log().flatMap((entry) =>
    entry._tag === "Update"
      ? [
        `${entry.path} ${entry.source._tag} ${
          (entry.message as { _tag: string })._tag
        }`
      ]
      : []
  )

const failures = (root: TestHost.TestRoot<unknown, never, unknown>) =>
  root.log().flatMap((entry) =>
    entry._tag === "Failed" ? [`${entry.path} ${entry.in}`] : []
  )

const items: ReadonlyArray<Item> = [{ id: "a", label: "Archive" }, {
  id: "c",
  label: "Copy"
}]

const WrappedDialog = Html.component({
  name: "WrappedDialog",
  props: Schema.Struct({ label: Schema.String }),
  model: Schema.Null,
  message: DialogEvents,
  events: DialogEvents
}).make({
  init: () => null,
  update: ($, event) => $.emit(event),
  parts: (p) =>
    p.child(Dialog, {
      props: p.props,
      onEmit: (event) => event,
      parts: (dialog) => dialog
    })
})

const ComboMessage = UiSchema.TaggedEnum({
  Picked: { id: Schema.String },
  Closed: {}
})
const ComboEvents = UiSchema.TaggedEnum({ Picked: { id: Schema.String } })

const Combo = Html.component({
  name: "Combo",
  props: Schema.Struct({ items: Schema.Array(Item) }),
  model: Schema.Array(Schema.String),
  message: ComboMessage,
  events: ComboEvents
}).make({
  init: () => [],
  update: ($, message) =>
    ComboMessage.match(message, {
      Picked: ({ id }) =>
        $.set([...$.model, "picked " + id]).emit(ComboEvents.Picked({ id })),
      Closed: () => [...$.model, "closed"]
    }),
  parts: (p, log) => {
    const badge = p.part(
      "output",
      (b) => b.attr("data-count", String(log.length))
    )
    return p.child(WrappedDialog, {
      props: { label: "Confirm" },
      onEmit: () => ComboMessage.Closed(),
      parts: (dialog) =>
        p.child(Menu, {
          key: "menu",
          props: { items: p.props.items },
          onEmit: (event) => ComboMessage.Picked({ id: event.id }),
          parts: (menu) => ({ dialog, menu, badge, log })
        })
    })
  }
})

const AppMessage = UiSchema.TaggedEnum({
  Picked: { id: Schema.String },
  Clicked: { id: Schema.String }
})

const App = Html.component({
  name: "App",
  model: Schema.Array(Schema.String),
  message: AppMessage
})
  .make({
    init: () => [],
    update: ($, message) =>
      AppMessage.match(message, {
        Picked: ({ id }) => [...$.model, "picked " + id],
        Clicked: ({ id }) => [...$.model, "clicked " + id]
      }),
    view: (h, log) =>
      Combo(h, {
        key: "combo",
        props: { items },
        onEmit: (event) => AppMessage.Picked({ id: event.id }),
        view: (combo) =>
          h.div(
            combo.dialog.popup(h.dialog).children(
              combo.menu.trigger(h.button).children("Combo menu"),
              h.ul.children(combo.menu.visible.map((item) =>
                combo.dialog.close(combo.menu.item(h.li.key(item.id), item))
                  .on("click", AppMessage.Clicked({ id: item.id }))
                  .children(item.label)
              ))
            ),
            combo.badge(h.output).children(log.join(", "))
          )
      })
  })

const ChildFailed = UiSchema.TaggedEnum({ Said: {}, Failed: {} })
const Hello = Html.component({
  name: "Hello",
  model: Schema.Null,
  message: Schema.Never,
  events: UiSchema.TaggedEnum({ Said: {} })
}).make({
  init: ($) => $.set(null).emit({ _tag: "Said" }),
  update: ($) => $.model,
  parts: () => ({})
})
const Broken = Html.component({
  name: "Broken",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  parts: (): {} => {
    throw new Error("broken")
  }
})

const owning = (
  child: typeof Hello | typeof Broken,
  parts: (heard: ReadonlyArray<string>) => unknown = (heard) => ({ heard }),
  extra?: Record<string, unknown>
) => {
  const Owner = Html.component({
    name: "Owner",
    model: Schema.Array(Schema.String),
    message: ChildFailed,
    events: UiSchema.TaggedEnum({ Lost: {} })
  }).make({
    init: () => [],
    update: ($, message) =>
      ChildFailed.match(message, {
        Said: () => [...$.model, "said"],
        Failed: () => $.set([...$.model, "failed"]).emit({ _tag: "Lost" })
      }),
    parts: (p, heard) =>
      p.child(child as typeof Hello, {
        ...(extra as {}),
        onEmit: () => ChildFailed.Said(),
        onFailure: () => ChildFailed.Failed(),
        parts: () => parts(heard) as { readonly heard: ReadonlyArray<string> }
      })
  })
  return Html.component({
    name: "App",
    model: Schema.Array(Schema.String),
    message: Schema.String
  })
    .make({
      init: () => [],
      update: ($, message) => [...$.model, message],
      view: (h, log) =>
        h.div(
          Owner(h, {
            onEmit: () => "lost",
            fallback: () => h.text("owner down"),
            view: (owner) => h.span.children("heard " + owner.heard.join(","))
          }),
          h.p.children(log.join(","))
        )
    })
}

describe("p.child", () => {
  it.effect("an owned child's event goes through the declaring component's update, and replays from the log", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(App, {})
      Locator.fire(element(root, "Copy"), "click")
      yield* TestHost.settle
      assert.deepStrictEqual(updates(root), [
        "/App/Combo[combo]/WrappedDialog[]/Dialog[]/Menu[menu] DomEvent Pick",
        "/App/Combo[combo] Emit Picked",
        "/App Emit Picked",
        "/App/Combo[combo]/WrappedDialog[]/Dialog[] DomEvent Close",
        "/App/Combo[combo]/WrappedDialog[] Emit Closed",
        "/App/Combo[combo] Emit Closed",
        "/App DomEvent Clicked"
      ])
      assert.strictEqual(
        element(root, "picked c, clicked c").attrs["data-count"],
        "2"
      )
      // @ts-expect-error Story.fromLog's signature takes no headless component, though the replay runs one
      const replay = Story.fromLog(Combo, root.log())
      assert.strictEqual(replay.path, "/App/Combo[combo]")
      assert.strictEqual(replay.replayed, 2)
      assert.isUndefined(replay.divergence)
      assert.deepStrictEqual(replay.model, ["picked c", "closed"])
    }).pipe(provideHost))

  it.effect("an event the child emits from init goes to the declaring component", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(owning(Hello), {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "heard said")
    }).pipe(provideHost))

  it.effect("a failed owned child stays blank, and the declaring component hears of it without failing", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(owning(Broken), {})
      yield* TestHost.settle
      assert.deepStrictEqual(failures(root), ["/App/Owner[]/Broken[] view"])
      assert.strictEqual(root.text(), "lost")
    }).pipe(provideHost))

  it.effect("a throw in p.child's parts, or a refused option, fails the declaring component with the source view", () =>
    Effect.gen(function*() {
      const thrown = yield* TestHost.mount(
        owning(Hello, () => {
          throw new Error("merge")
        }),
        {}
      )
      yield* TestHost.settle
      assert.deepStrictEqual(failures(thrown), ["/App/Owner[] view"])
      assert.strictEqual(thrown.text(), "owner down")

      const refused = yield* TestHost.mount(
        owning(Hello, undefined, { fallback: () => "x" }),
        {}
      )
      assert.deepStrictEqual(failures(refused), ["/App/Owner[] view"])
      assert.strictEqual(refused.text(), "owner down")
    }).pipe(provideHost))
})

describe("p.child on the server", () => {
  it.effect("the client adopts the server's render of every owned child", () =>
    Effect.gen(function*() {
      const result = yield* ssr(App, {})
      assert.includeMembers([...result.adopted], [
        "/App/Combo[combo]",
        "/App/Combo[combo]/WrappedDialog[]",
        "/App/Combo[combo]/WrappedDialog[]/Dialog[]",
        "/App/Combo[combo]/WrappedDialog[]/Dialog[]/Menu[menu]"
      ])
    }).pipe(provideHost))
})

describe("p.child in a Scene", () => {
  it("a scene of the composed component runs its owned children's events through its update", () => {
    const scene = Scene.start(Combo, { items }, {
      elements: Html,
      view: (combo, h) =>
        h.div(
          combo.dialog.popup(h.dialog),
          combo.badge(h.output).children(combo.log.join(", "))
        )
    })
    scene.childEmit(Menu, "menu", { _tag: "Picked", id: "a" })
      .emitted(ComboEvents.Picked({ id: "a" }))
      .childEmit(WrappedDialog, { _tag: "Closed" })
      .givenChild(Dialog, { open: true })
      .parts((combo) => {
        assert.deepStrictEqual(combo.log, ["picked a", "closed"])
        assert.isTrue(combo.dialog.open)
      })
    assert.isTrue(Story.parts(Combo, scene.current).dialog.open)
    assert.isFalse(
      Story.parts(Combo, { model: [], props: { items } }).dialog.open
    )
  })

  it.effect("an owned child's event for an owner an earlier event replaced reaches nothing, as in the runtime", () =>
    Effect.gen(function*() {
      const Press = UiSchema.TaggedEnum({ Press: {} })
      const Step = UiSchema.TaggedEnum({ Wrap: {}, Inc: {} })
      const Inner = Html.component({
        name: "Inner",
        model: Schema.Null,
        message: Press,
        events: Step
      }).make({
        init: () => null,
        update: ($) => $.set($.model).emit(Step.Wrap(), Step.Inc()),
        parts: (p) => ({
          button: p.part("button", (b) => b.on("click", Press.Press()))
        })
      })
      const Wrapped = UiSchema.TaggedEnum({ Wrap: {} })
      const Outer = Html.component({
        name: "Outer",
        model: Schema.Number,
        message: Step,
        events: Wrapped
      }).make({
        init: () => 0,
        update: ($, message) =>
          message._tag === "Wrap"
            ? $.set($.model).emit(Wrapped.Wrap())
            : $.model + 1,
        parts: (p, count) =>
          p.child(Inner, {
            onEmit: (event) => event,
            parts: (inner) => ({ count, button: inner.button })
          })
      })
      const Shell = Html.component({
        name: "Shell",
        model: Schema.Boolean,
        message: Wrapped
      }).make({
        init: () => false,
        update: () => true,
        view: (h, wrap) => {
          const outer = Outer(h, {
            key: "outer",
            onEmit: (event) => event,
            view: (outer) =>
              outer.button(h.button).children(String(outer.count))
          })
          return wrap ? h.section(outer) : h.div(outer)
        }
      })
      // Wrap remounts Outer and Inner, so the Inc Inner emitted after it was for the Outer that closed.
      const root = yield* TestHost.mount(Shell, {})
      yield* TestHost.settle
      Locator.fire(element(root, "0"), "click")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "0")
      const scene = Scene.start(Shell, {})
      scene.click("0").expect(Locator.tag("section")).toHaveText("0")
    }).pipe(Effect.scoped, provideHost))

  it("a scene of a consumer runs an owned child's events through its owner, and gives its Model only when it can tell which", () => {
    const scene = Scene.start(App, {})
    // The row's layers run deepest owner first: the Menu's pick reaches App through Combo, the Dialog's
    // close reaches Combo through WrappedDialog, and App's own handler runs last.
    scene.click("Copy")
      .expect(Locator.tag("output")).toHaveText("picked c, clicked c")
      .expect(Locator.tag("output")).toHaveAttribute("data-count", "2")
    scene.childEmit(Dialog, { _tag: "Closed" })
      .expect(Locator.tag("output")).toHaveAttribute("data-count", "3")
    scene.givenChild(Dialog, { open: true }).expect(Locator.tag("dialog"))
      .toExist()

    const Twice = Html.component({
      name: "Twice",
      model: Schema.Null,
      message: Schema.Never
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        h.div(
          ["a", "b"].map((key) =>
            Combo(h, {
              key,
              props: { items },
              view: (combo) => combo.dialog.popup(h.dialog)
            })
          )
        )
    })
    assert.throws(
      () => Scene.start(Twice, {}).givenChild(Dialog, { open: true }),
      /^Scene\.givenChild: 2 children Dialog without a key, declared with p\.child by \/Twice\/Combo\[a\]\/WrappedDialog\[\] and \/Twice\/Combo\[b\]\/WrappedDialog\[\]\. A scene can't choose/
    )
  })
})
