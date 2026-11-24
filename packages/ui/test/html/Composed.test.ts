// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Schema } from "effect"
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

const WrappedDialog = Component.define({
  name: "WrappedDialog",
  props: Schema.Struct({ label: Schema.String }),
  model: Schema.Null,
  message: DialogEvents,
  events: DialogEvents,
  elements: Html
}).make({
  init: () => null,
  update: ($, event) => $.emit([event]),
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

const Combo = Component.define({
  name: "Combo",
  props: Schema.Struct({ items: Schema.Array(Item) }),
  model: Schema.Array(Schema.String),
  message: ComboMessage,
  events: ComboEvents,
  elements: Html
}).make({
  init: () => [],
  update: ($, message) =>
    ComboMessage.match(message, {
      Picked: ({ id }) =>
        $.set([...$.model, "picked " + id]).emit([ComboEvents.Picked({ id })]),
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

const App = Component.define({
  name: "App",
  model: Schema.Array(Schema.String),
  message: AppMessage,
  elements: Html
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
          h.div([
            combo.dialog.popup(h.dialog).children([
              combo.menu.trigger(h.button).children(["Combo menu"]),
              h.ul.children(combo.menu.visible.map((item) =>
                combo.dialog.close(combo.menu.item(h.li.key(item.id), item))
                  .onClick(AppMessage.Clicked({ id: item.id }))
                  .children([item.label])
              ))
            ]),
            combo.badge(h.output).children([log.join(", ")])
          ])
      })
  })

const ChildFailed = UiSchema.TaggedEnum({ Said: {}, Failed: {} })
const Hello = Component.define({
  name: "Hello",
  model: Schema.Null,
  message: Schema.Never,
  events: UiSchema.TaggedEnum({ Said: {} }),
  elements: Html
}).make({
  init: ($) => $.set(null).emit([{ _tag: "Said" }]),
  update: ($) => $.model,
  parts: () => ({})
})
const Broken = Component.define({
  name: "Broken",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
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
  const Owner = Component.define({
    name: "Owner",
    model: Schema.Array(Schema.String),
    message: ChildFailed,
    events: UiSchema.TaggedEnum({ Lost: {} }),
    elements: Html
  }).make({
    init: () => [],
    update: ($, message) =>
      ChildFailed.match(message, {
        Said: () => [...$.model, "said"],
        Failed: () => $.set([...$.model, "failed"]).emit([{ _tag: "Lost" }])
      }),
    parts: (p, heard) =>
      p.child(child as typeof Hello, {
        ...(extra as {}),
        onEmit: () => ChildFailed.Said(),
        onFailure: () => ChildFailed.Failed(),
        parts: () => parts(heard) as { readonly heard: ReadonlyArray<string> }
      })
  })
  return Component.define({
    name: "App",
    model: Schema.Array(Schema.String),
    message: Schema.String,
    elements: Html
  })
    .make({
      init: () => [],
      update: ($, message) => [...$.model, message],
      view: (h, log) =>
        h.div([
          Owner(h, {
            onEmit: () => "lost",
            fallback: () => h.text("owner down"),
            view: (owner) => h.span.children(["heard " + owner.heard.join(",")])
          }),
          h.p.children([log.join(",")])
        ])
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
    const s = Scene.start(Combo, { items }, {
      elements: Html,
      view: (combo, h) =>
        h.div([
          combo.dialog.popup(h.dialog),
          combo.badge(h.output).children([combo.log.join(", ")])
        ])
    })
    s.childEmit(Menu, "menu", { _tag: "Picked", id: "a" })
      .emitted([ComboEvents.Picked({ id: "a" })])
      .childEmit(WrappedDialog, { _tag: "Closed" })
      .givenChild(Dialog, { open: true })
      .parts((combo) => {
        assert.deepStrictEqual(combo.log, ["picked a", "closed"])
        assert.isTrue(combo.dialog.open)
      })
    assert.isTrue(Story.parts(Combo, s.current).dialog.open)
    assert.isFalse(
      Story.parts(Combo, { model: [], props: { items } }).dialog.open
    )
  })

  it("a scene of a consumer refuses to run an owned child's events, and gives its Model only when it can tell which", () => {
    const s = Scene.start(App, {})
    assert.throws(
      () => s.childEmit(Dialog, { _tag: "Closed" }),
      /^Scene\.childEmit: \/App\/Combo\[combo\]\/WrappedDialog\[\]\/Dialog\[\] is declared with p\.child by \/App\/Combo\[combo\]\/WrappedDialog\[\], whose update takes its events\. A scene doesn't run a child's update/
    )
    assert.throws(
      () => s.childFailure(Dialog, Cause.fail("x")),
      /^Scene\.childFailure: .* is declared with p\.child/
    )
    assert.throws(
      () => s.childPending(Dialog),
      /^Scene\.childPending: .* is declared with p\.child/
    )
    s.givenChild(Dialog, { open: true }).expect(Locator.tag("dialog")).toExist()

    const Twice = Component.define({
      name: "Twice",
      model: Schema.Null,
      message: Schema.Never,
      elements: Html
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
