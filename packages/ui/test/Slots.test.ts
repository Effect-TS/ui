import { Command, Component, Feature, type MessageLog, Renderer, Route, Router } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Query, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { Tiny } from "./fixtures/vocabulary.ts"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestHost.layer()))
type Root = {
  readonly get: (locator: Query.Locator) => TestHost.TestNode
  readonly log: () => ReadonlyArray<MessageLog.Entry>
}
const click = (root: Root, text: string) => Query.fire(root.get(Query.text(text, { exact: true })), "click")
const updates = (root: Root) =>
  root.log().flatMap((entry) =>
    entry._tag === "Update" ? [entry.path + " " + entry.source._tag + " " + (entry.message as any)._tag] : []
  )
const unmounted = (root: Root) => root.log().flatMap((entry) => entry._tag === "Unmounted" ? [entry.path] : [])
const failures = (root: Root) =>
  root.log().flatMap((entry) => entry._tag === "Failed" ? [entry.path + " " + entry.in] : [])

const define = <const Name extends string>(name: Name) =>
  Component.define({ name, model: Schema.Null, message: Schema.Never, elements: Html })
const slotted = <const Name extends string>(name: Name) =>
  Component.define({ name, model: Schema.Null, message: Schema.Never, elements: Html, slots: ["body"] })
const Leaf = define("Leaf").make({ init: () => null, update: (m) => m, view: (_, h) => h.p("leaf") })

// Places its slot until "toggle" hides it.
let frameViews = 0
const Toggle = Schema.TaggedUnion({ Toggle: {} })
const Frame = Component.define({
  name: "Frame",
  model: Schema.Boolean,
  message: Toggle,
  elements: Html,
  slots: ["body"]
}).make({
  init: () => true,
  update: (shown) => !shown,
  view: (shown, h) => {
    frameViews++
    return h.div(h.button.onClick(Toggle.make({ _tag: "Toggle" })).children("toggle"), shown && h.slots.body)
  }
})

const EditorMsg = Schema.TaggedUnion({ Type: {}, Clear: {}, Break: {} })
const Editor = Component.define({
  name: "Editor",
  model: Schema.Number,
  message: EditorMsg,
  events: Schema.Number,
  receives: ["Clear"],
  elements: Html
}).make({
  init: () => 0,
  update: (n, msg, $) => {
    if (msg._tag === "Break") throw new Error("broke")
    return msg._tag === "Clear" ? 0 : $.set(n + 1).emit(n + 1)
  },
  view: (n, h) =>
    h.span(
      h.button.onClick(EditorMsg.make({ _tag: "Type" })).children("type " + n),
      h.button.onClick(EditorMsg.make({ _tag: "Break" })).children("break")
    )
})
const Draft = Editor.ref("Draft")

const PageMsg = Schema.TaggedUnion({ Changed: { count: Schema.Number }, Clear: {}, Failed: {} })
const Page = Component.define({ name: "Page", model: Schema.String, message: PageMsg, elements: Html }).make({
  init: () => "",
  update: (log, msg, $) =>
    msg._tag === "Clear"
      ? $.send(Draft, { _tag: "Clear" })
      : log + (msg._tag === "Changed" ? "changed " + msg.count : "failed"),
  view: (log, h) =>
    h.div(
      h.button.onClick(PageMsg.make({ _tag: "Clear" })).children("clear"),
      Frame(h, {
        key: "f",
        slots: {
          body: [
            h.output(log),
            Editor(h, {
              ref: Draft,
              onEmit: (count) => PageMsg.make({ _tag: "Changed", count }),
              onFailure: () => PageMsg.make({ _tag: "Failed" }),
              fallback: () => h.span("editor down")
            })
          ]
        }
      })
    )
})
const editorPath = "/Page/Frame[f]/[body]/Editor[Draft]"

class Badge extends Feature.Service<Badge>()("Badge", { props: Schema.Struct({}) }) {}
const badge = (text: string) =>
  Badge.toLayer(define("Badge").make({ init: () => null, update: (m) => m, view: (_, h) => h.span(text) }))

describe("slots", () => {
  it.effect("content's handlers, emits and failures reach the parent that wrote it", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      click(root, "type 0")
      yield* TestHost.settle
      click(root, "break")
      yield* TestHost.settle
      assert.include(root.text(), "changed 1failed")
      assert.include(root.text(), "editor down")
      assert.deepStrictEqual(updates(root), [
        editorPath + " DomEvent Type",
        "/Page Emit Changed",
        "/Page Failure Failed"
      ])
      assert.deepStrictEqual(failures(root), [editorPath + " update"])
    })))

  it.effect("a parent render patches the outlet without running the receiver's view", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      frameViews = 0
      click(root, "type 0")
      yield* TestHost.settle
      assert.include(root.text(), "changed 1")
      assert.strictEqual(frameViews, 0)
    })))

  it.effect("$.send reaches a child in content by its ref", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      click(root, "type 0")
      yield* TestHost.settle
      click(root, "clear")
      yield* TestHost.settle
      assert.include(root.text(), "type 0")
      assert.include(updates(root), editorPath + " Send Clear")
    })))

  it.effect("unplacing a slot unmounts its content, which starts over when placed again", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      click(root, "type 0")
      click(root, "toggle")
      yield* TestHost.settle
      assert.include(unmounted(root), editorPath)
      click(root, "toggle")
      yield* TestHost.settle
      assert.include(root.text(), "type 0")
    })))

  it.effect("content resolves services where the parent declared the child, not from the child's Layer", () =>
    provideHost(Effect.gen(function*() {
      const Parent = Component.provide(
        define("Parent").make({
          init: () => null,
          update: (m) => m,
          view: (_, h) =>
            Component.provide(Frame, badge("frame's"))(h, {
              key: "f",
              slots: { body: Badge.render(h, { key: "b", fallback: () => h.span("no badge") }) }
            })
        }),
        badge("parent's")
      )
      const root = yield* TestHost.mount(Parent, {})
      yield* TestHost.settle
      assert.include(root.text(), "parent's")
      assert.notInclude(root.text(), "frame's")
    })))

  it.effect("content passed after the child mounted belongs to the parent too", () =>
    provideHost(Effect.gen(function*() {
      const LateMsg = Schema.TaggedUnion({ Fill: {}, Hit: {} })
      const Late = Component.provide(
        Component.define({ name: "Late", model: Schema.Boolean, message: LateMsg, elements: Html }).make({
          init: () => false,
          update: () => true,
          view: (filled, h) =>
            h.div(
              h.button.onClick(LateMsg.make({ _tag: "Fill" })).children("fill"),
              // No slots at first: the content comes with a later render.
              filled
                ? Frame(h, {
                  key: "f",
                  slots: {
                    body: [
                      h.button.onClick(LateMsg.make({ _tag: "Hit" })).children("hit"),
                      Badge.render(h, { key: "b", fallback: () => h.span("no badge") })
                    ]
                  }
                })
                : Frame(h, { key: "f" })
            )
        }),
        badge("late's")
      )
      const root = yield* TestHost.mount(Late, {})
      click(root, "fill")
      yield* TestHost.settle
      click(root, "hit")
      yield* TestHost.settle
      assert.include(root.text(), "late's")
      assert.deepStrictEqual(updates(root), ["/Late DomEvent Fill", "/Late DomEvent Hit"])
    })))

  it.effect("a DOM ref in content resolves for the parent that wrote it", () =>
    provideHost(Effect.gen(function*() {
      const Field = Renderer.ref<HTMLInputElement>("Field")
      const Look = Command.make("Look", { args: {} }, () =>
        Effect.gen(function*() {
          const refs = yield* Renderer.Refs
          return Option.isSome(yield* refs.lookup(Field))
        }))
      const Form = Component.define({
        name: "Form",
        model: Schema.optional(Schema.Boolean),
        message: Schema.Boolean,
        elements: Html
      }).make({
        init: ($) => $.set(undefined).run(Look()),
        update: (_, found) => found,
        view: (_, h) => Frame(h, { key: "f", slots: { body: h.input.ref(Field) } })
      })
      const root = yield* TestHost.mount(Form, {})
      yield* TestHost.settle
      assert.strictEqual(root.model(), true)
    })))

  it.effect("forwarded content keeps its path under the first receiver, and closes with the one that places it", () =>
    provideHost(Effect.gen(function*() {
      const Outer = slotted("Outer").make({
        init: () => null,
        update: (m) => m,
        view: (_, h) => Frame(h, { key: "f", slots: { body: h.slots.body } })
      })
      const Top = Component.define({ name: "Top", model: Schema.Null, message: PageMsg, elements: Html }).make({
        init: () => null,
        update: (m) => m,
        view: (_, h) =>
          Outer(h, {
            key: "o",
            slots: { body: Editor(h, { key: "e", onEmit: (count) => PageMsg.make({ _tag: "Changed", count }) }) }
          })
      })
      const root = yield* TestHost.mount(Top, {})
      click(root, "type 0")
      yield* TestHost.settle
      assert.deepStrictEqual(updates(root), ["/Top/Outer[o]/[body]/Editor[e] DomEvent Type", "/Top Emit Changed"])
      click(root, "toggle")
      yield* TestHost.settle
      assert.include(unmounted(root), "/Top/Outer[o]/[body]/Editor[e]")
    })))

  it.effect("navigating away from a view with a placed slot succeeds", () =>
    Effect.gen(function*() {
      yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      const router = yield* Router.Router
      assert.strictEqual(yield* router.navigate("/next"), "navigated")
    }).pipe(
      Effect.provide(Router.memory({ routes: Route.union({ Home: Route.make("/"), Next: Route.make("/next") }) })),
      provideHost
    ))
})

describe("placing a slot twice fails the receiver", () => {
  const Headless = define("Headless").make({ init: () => null, update: (m) => m, parts: () => ({}) })
  const cases = {
    "in its view": slotted("Twice").make({
      init: () => null,
      update: (m) => m,
      view: (_, h) => h.div(h.slots.body, h.slots.body)
    }),
    "once forwarded to a child": slotted("Twice").make({
      init: () => null,
      update: (m) => m,
      view: (_, h) => h.div(h.slots.body, Frame(h, { key: "f", slots: { body: h.slots.body } }))
    }),
    "once in a headless child's closure": slotted("Twice").make({
      init: () => null,
      update: (m) => m,
      view: (_, h) => h.div(h.slots.body, Headless(h, { key: "h", view: () => h.slots.body }))
    })
  }
  for (const [where, Twice] of Object.entries(cases)) {
    it.effect(where, () =>
      provideHost(Effect.gen(function*() {
        const Holder = define("Holder").make({
          init: () => null,
          update: (m) => m,
          view: (_, h) => Twice(h, { key: "c", slots: { body: "x" }, fallback: () => h.p("child down") })
        })
        const root = yield* TestHost.mount(Holder, {})
        yield* TestHost.settle
        assert.strictEqual(root.text(), "child down")
        assert.deepStrictEqual(failures(root), ["/Holder/Twice[c] view"])
      })))
  }

  it.effect("but not when it forwards the slot through a headless closure in a child's content", () =>
    provideHost(Effect.gen(function*() {
      const Forward = slotted("Forward").make({
        init: () => null,
        update: (m) => m,
        view: (_, h) => Frame(h, { key: "f", slots: { body: Headless(h, { key: "h", view: () => h.slots.body }) } })
      })
      const Holder = define("Holder").make({
        init: () => null,
        update: (m) => m,
        view: (_, h) => Forward(h, { key: "c", slots: { body: "x" } })
      })
      const root = yield* TestHost.mount(Holder, {})
      yield* TestHost.settle
      assert.include(root.text(), "x")
      assert.deepStrictEqual(failures(root), [])
    })))
})

describe("a mistake in content fails the parent that wrote it", () => {
  const Broken = define("Broken").make({
    init: () => {
      throw new Error("broke")
    },
    update: (m) => m,
    view: (_, h) => h.p("broken")
  })
  const writers = {
    "two elements with one key": define("Writer").make({
      init: () => null,
      update: (m) => m,
      view: (_, h) => Frame(h, { key: "f", slots: { body: [h.li.key("a"), h.li.key("a")] } })
    }),
    "a child ref key also used in its view": define("Writer").make({
      init: () => null,
      update: (m) => m,
      view: (_, h) =>
        h.div(Leaf(h, { ref: Leaf.ref("N") }), Frame(h, { key: "f", slots: { body: Leaf(h, { ref: Leaf.ref("N") }) } }))
    }),
    "a fallback at a sibling's path": define("Writer").make({
      init: () => null,
      update: (m) => m,
      view: (_, h) =>
        Frame(h, {
          key: "f",
          slots: { body: [Leaf(h, { key: "a" }), Broken(h, { key: "b", fallback: () => Leaf(h, { key: "a" }) })] }
        })
    })
  }
  for (const [mistake, Writer] of Object.entries(writers)) {
    it.effect(mistake, () =>
      provideHost(Effect.gen(function*() {
        const Top = define("Top").make({
          init: () => null,
          update: (m) => m,
          view: (_, h) => Writer(h, { key: "w", fallback: () => h.p("writer down") })
        })
        const root = yield* TestHost.mount(Top, {})
        yield* TestHost.settle
        assert.strictEqual(root.text(), "writer down")
        assert.include(failures(root), "/Top/Writer[w] view")
      })))
  }

  it.effect("text forwarded to a slot placed where the vocabulary allows none", () =>
    provideHost(Effect.gen(function*() {
      const tiny = <const Name extends string>(name: Name) =>
        Component.define({ name, model: Schema.Null, message: Schema.Never, elements: Tiny, slots: ["body"] })
      const Inner = tiny("Inner").make({
        init: () => null,
        update: (m) => m,
        view: (_, h) => h.el("box", h.slots.body)
      })
      const Outer = tiny("Outer").make({
        init: () => null,
        update: (m) => m,
        view: (_, h) => Inner(h, { key: "i", slots: { body: h.slots.body } })
      })
      const Writer = Component.define({ name: "Writer", model: Schema.Null, message: Schema.Never, elements: Tiny })
        .make({ init: () => null, update: (m) => m, view: (_, h) => Outer(h, { key: "o", slots: { body: "loose" } }) })
      const Top = Component.define({ name: "Top", model: Schema.Null, message: Schema.Never, elements: Tiny }).make({
        init: () => null,
        update: (m) => m,
        view: (_, h) => Writer(h, { key: "w", fallback: () => h.label("writer down") })
      })
      const root = yield* TestHost.mount(Top, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "writer down")
      assert.deepStrictEqual(failures(root), ["/Top/Writer[w] view"])
    })))
})
