import { Command, Component, Feature, type MessageLog, Renderer, Route, Router, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { Tiny } from "./fixtures/vocabulary.ts"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestHost.layer()))
type Root = {
  readonly get: (locator: Locator.Locator) => TestHost.TestNode
  readonly log: () => ReadonlyArray<MessageLog.Entry>
}
const click = (root: Root, text: string) => Locator.fire(root.get(Locator.text(text, { exact: true })), "click")
const updates = (root: Root) =>
  root.log().flatMap((entry) =>
    entry._tag === "Update" ? [entry.path + " " + entry.source._tag + " " + (entry.message as any)._tag] : []
  )
const unmounted = (root: Root) => root.log().flatMap((entry) => entry._tag === "Unmounted" ? [entry.path] : [])
const failures = (root: Root) =>
  root.log().flatMap((entry) => entry._tag === "Failed" ? [entry.path + " " + entry.in] : [])

const define = <const Name extends string>(name: Name) =>
  Component.define({ name, scoped: false, model: Schema.Null, message: Schema.Never, elements: Html })
const slotted = <const Name extends string>(name: Name) =>
  Component.define({ name, scoped: false, model: Schema.Null, message: Schema.Never, elements: Html, slots: ["body"] })
const Leaf = define("Leaf").make({ init: () => null, update: ($) => $.model, view: (h) => h.p("leaf") })

// Places its slot until "toggle" hides it.
let frameViews = 0
const Toggle = UiSchema.TaggedEnum({ Toggle: {} })
const Frame = Component.define({
  name: "Frame",
  scoped: false,
  model: Schema.Boolean,
  message: Toggle,
  elements: Html,
  slots: ["body"]
}).make({
  init: () => true,
  update: ($) => !$.model,
  view: (h, shown) => {
    frameViews++
    return h.div(h.button.onClick(Toggle.Toggle()).children("toggle"), shown && h.slots.body)
  }
})

const EditorMsg = UiSchema.TaggedEnum({ Typed: {}, Break: {} })
const Editor = Component.define({
  name: "Editor",
  scoped: false,
  model: Schema.Number,
  message: EditorMsg,
  events: Schema.Number,
  elements: Html
}).make({
  init: () => 0,
  update: ($, msg) => {
    if (msg._tag === "Break") throw new Error("broke")
    return $.set($.model + 1).emit($.model + 1)
  },
  view: (h, n) =>
    h.span(
      h.button.onClick(EditorMsg.Typed()).children("type " + n),
      h.button.onClick(EditorMsg.Break()).children("break")
    )
})

const PageMsg = UiSchema.TaggedEnum({ Changed: { count: Schema.Number }, Failed: {} })
const Page = Component.define({ name: "Page", scoped: false, model: Schema.String, message: PageMsg, elements: Html })
  .make({
    init: () => "",
    update: ($, msg) => $.model + (msg._tag === "Changed" ? "changed " + msg.count : "failed"),
    view: (h, log) =>
      Frame(h, {
        key: "f",
        slots: {
          body: [
            h.output(log),
            Editor(h, {
              key: "Draft",
              onEmit: (count) => PageMsg.Changed({ count }),
              onFailure: () => PageMsg.Failed(),
              fallback: () => h.span("editor down")
            })
          ]
        }
      })
  })
const editorPath = "/Page/Frame[f]/[body]/Editor[Draft]"

class Badge extends Feature.Service<Badge>()("Badge", { props: Schema.Struct({}) }) {}
const badge = (text: string) =>
  Badge.toLayer(define("Badge").make({ init: () => null, update: ($) => $.model, view: (h) => h.span(text) }))

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
        editorPath + " DomEvent Typed",
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
          update: ($) => $.model,
          view: (h) =>
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
      const LateMsg = UiSchema.TaggedEnum({ Fill: {}, Hit: {} })
      const Late = Component.provide(
        Component.define({ name: "Late", scoped: false, model: Schema.Boolean, message: LateMsg, elements: Html }).make(
          {
            init: () => false,
            update: () => true,
            view: (h, filled) =>
              h.div(
                h.button.onClick(LateMsg.Fill()).children("fill"),
                // No slots at first: the content comes with a later render.
                filled
                  ? Frame(h, {
                    key: "f",
                    slots: {
                      body: [
                        h.button.onClick(LateMsg.Hit()).children("hit"),
                        Badge.render(h, { key: "b", fallback: () => h.span("no badge") })
                      ]
                    }
                  })
                  : Frame(h, { key: "f" })
              )
          }
        ),
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
        scoped: false,
        model: Schema.optional(Schema.Boolean),
        message: Schema.Boolean,
        elements: Html
      }).make({
        init: ($) => $.set(undefined).run(Look.make()),
        update: (_, found) => found,
        view: (h) => Frame(h, { key: "f", slots: { body: h.input.ref(Field) } })
      })
      const root = yield* TestHost.mount(Form, {})
      yield* TestHost.settle
      assert.strictEqual(root.model(), true)
    })))

  it.effect("forwarded content keeps its path under the first receiver, and closes with the one that places it", () =>
    provideHost(Effect.gen(function*() {
      const Outer = slotted("Outer").make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => Frame(h, { key: "f", slots: { body: h.slots.body } })
      })
      const Top = Component.define({ name: "Top", scoped: false, model: Schema.Null, message: PageMsg, elements: Html })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            Outer(h, {
              key: "o",
              slots: { body: Editor(h, { key: "e", onEmit: (count) => PageMsg.Changed({ count }) }) }
            })
        })
      const root = yield* TestHost.mount(Top, {})
      click(root, "type 0")
      yield* TestHost.settle
      assert.deepStrictEqual(updates(root), ["/Top/Outer[o]/[body]/Editor[e] DomEvent Typed", "/Top Emit Changed"])
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
  const Headless = define("Headless").make({ init: () => null, update: ($) => $.model, parts: () => ({}) })
  const cases = {
    "in its view": slotted("Twice").make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => h.div(h.slots.body, h.slots.body)
    }),
    "once forwarded to a child": slotted("Twice").make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => h.div(h.slots.body, Frame(h, { key: "f", slots: { body: h.slots.body } }))
    }),
    "once in a headless child's closure": slotted("Twice").make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => h.div(h.slots.body, Headless(h, { key: "h", view: () => h.slots.body }))
    })
  }
  for (const [where, Twice] of Object.entries(cases)) {
    it.effect(where, () =>
      provideHost(Effect.gen(function*() {
        const Holder = define("Holder").make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => Twice(h, { key: "c", slots: { body: "x" }, fallback: () => h.p("child down") })
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
        update: ($) => $.model,
        view: (h) => Frame(h, { key: "f", slots: { body: Headless(h, { key: "h", view: () => h.slots.body }) } })
      })
      const Holder = define("Holder").make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => Forward(h, { key: "c", slots: { body: "x" } })
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
    update: ($) => $.model,
    view: (h) => h.p("broken")
  })
  const writers = {
    "two elements with one key": define("Writer").make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => Frame(h, { key: "f", slots: { body: [h.li.key("a"), h.li.key("a")] } })
    }),
    "a fallback at a sibling's path": define("Writer").make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
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
          update: ($) => $.model,
          view: (h) => Writer(h, { key: "w", fallback: () => h.p("writer down") })
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
        Component.define({
          name,
          scoped: false,
          model: Schema.Null,
          message: Schema.Never,
          elements: Tiny,
          slots: ["body"]
        })
      const Inner = tiny("Inner").make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.el("box", h.slots.body)
      })
      const Outer = tiny("Outer").make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => Inner(h, { key: "i", slots: { body: h.slots.body } })
      })
      const Writer = Component.define({
        name: "Writer",
        scoped: false,
        model: Schema.Null,
        message: Schema.Never,
        elements: Tiny
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => Outer(h, { key: "o", slots: { body: "loose" } })
        })
      const Top = Component.define({
        name: "Top",
        scoped: false,
        model: Schema.Null,
        message: Schema.Never,
        elements: Tiny
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => Writer(h, { key: "w", fallback: () => h.label("writer down") })
      })
      const root = yield* TestHost.mount(Top, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "writer down")
      assert.deepStrictEqual(failures(root), ["/Top/Writer[w] view"])
    })))
})
