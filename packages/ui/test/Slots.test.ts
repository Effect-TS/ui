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
const paths = (root: Root, tag: MessageLog.Entry["_tag"]) =>
  root.log().flatMap((entry) => entry._tag === tag ? [(entry as { readonly path: string }).path] : [])
const failures = (root: Root) =>
  root.log().flatMap((entry) => entry._tag === "Failed" ? [entry.path + " " + entry.source] : [])

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

class Badge extends Feature.Service<Badge>()("Badge", { props: Schema.Struct({}) }) {}
const badge = (text: string) =>
  Component.define({ name: "Badge" + text, model: Schema.Null, message: Schema.Never, elements: Html }).make({
    init: () => null,
    update: (model) => model,
    view: (_, h) => h.span(text)
  })

const EditorMsg = Schema.TaggedUnion({ Typed: {}, Clear: {}, Break: {} })
const Editor = Component.define({
  name: "Editor",
  model: Schema.Number,
  message: EditorMsg,
  events: Schema.TaggedUnion({ Changed: { count: Schema.Number } }),
  receives: ["Clear"],
  elements: Html
}).make({
  init: () => 0,
  update: (n, msg, $) => {
    if (msg._tag === "Break") throw new Error("broke")
    return msg._tag === "Clear" ? 0 : $.set(n + 1).emit({ _tag: "Changed", count: n + 1 })
  },
  view: (n, h) =>
    h.span(
      h.button.onClick(EditorMsg.make({ _tag: "Typed" })).children("type " + n),
      h.button.onClick(EditorMsg.make({ _tag: "Break" })).children("break " + n)
    )
})
const Draft = Editor.ref("Draft")

let panelViews = 0
const PanelMsg = Schema.TaggedUnion({ Toggle: {}, Note: {}, Move: {} })
const Panel = Component.provide(
  Component.define({
    name: "Panel",
    model: Schema.Struct({ open: Schema.Boolean, note: Schema.Boolean, moved: Schema.Boolean }),
    message: PanelMsg,
    elements: Html,
    slots: ["body", "footer"]
  }).make({
    init: () => ({ open: true, note: false, moved: false }),
    update: (model, msg) =>
      msg._tag === "Toggle"
        ? { ...model, open: !model.open }
        : msg._tag === "Note"
        ? { ...model, note: !model.note }
        : { ...model, moved: !model.moved },
    view: (model, h) => {
      panelViews++
      return h.section(
        h.button.onClick(PanelMsg.make({ _tag: "Toggle" })).children("toggle"),
        h.button.onClick(PanelMsg.make({ _tag: "Note" })).children("note"),
        h.button.onClick(PanelMsg.make({ _tag: "Move" })).children("move"),
        // A sibling that comes and goes before the outlet, which is keyed by its name.
        model.note && h.p("a note"),
        model.open && !model.moved && h.slots.body,
        model.open && model.moved && h.div(h.slots.body),
        Badge.render(h, { key: "own", fallback: () => h.span("no badge") }),
        h.footer(h.slots.footer)
      )
    }
  }),
  Badge.toLayer(badge("panel's"))
)

const PageMsg = Schema.TaggedUnion({
  Bump: {},
  Changed: { count: Schema.Number },
  Clear: {},
  EditorFailed: {}
})
const Page = Component.provide(
  Component.define({
    name: "Page",
    model: Schema.Struct({ bumps: Schema.Number, log: Schema.Array(Schema.String) }),
    message: PageMsg,
    elements: Html
  }).make({
    init: () => ({ bumps: 0, log: [] }),
    update: (model, msg, $) =>
      PageMsg.match(msg, {
        Bump: () => ({ ...model, bumps: model.bumps + 1 }),
        Changed: ({ count }) => ({ ...model, log: [...model.log, "changed " + count] }),
        Clear: () => $.send(Draft, { _tag: "Clear" }),
        EditorFailed: () => ({ ...model, log: [...model.log, "editor failed"] })
      }),
    view: (model, h) =>
      h.div(
        h.button.onClick(PageMsg.make({ _tag: "Bump" })).children("bump"),
        h.button.onClick(PageMsg.make({ _tag: "Clear" })).children("clear"),
        Panel(h, {
          key: "details",
          slots: {
            body: [
              h.p("bumps " + model.bumps),
              Editor(h, {
                ref: Draft,
                onEmit: (event) => PageMsg.make({ _tag: "Changed", count: event.count }),
                onFailure: () => PageMsg.make({ _tag: "EditorFailed" }),
                fallback: () => h.span("editor down")
              }),
              Badge.render(h, { key: "content", fallback: () => h.span("no badge") })
            ],
            footer: h.small("footer " + model.bumps)
          }
        }),
        h.output(model.log.join(", "))
      )
  }),
  Badge.toLayer(badge("page's"))
)

describe("slots", () => {
  it.effect("content's handlers and emits reach the parent that wrote it", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "bump")
      yield* TestHost.settle
      click(root, "type 0")
      yield* TestHost.settle
      assert.include(root.text(), "bumps 1")
      assert.include(root.text(), "footer 1")
      assert.include(root.text(), "changed 1")
      assert.deepStrictEqual(updates(root), [
        "/Page DomEvent Bump",
        "/Page/Panel[details]/[body]/Editor[Draft] DomEvent Typed",
        "/Page Emit Changed"
      ])
    })))

  it.effect("a parent render patches the outlets alone: the child's view doesn't run and its props didn't change", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      panelViews = 0
      click(root, "bump")
      yield* TestHost.settle
      click(root, "bump")
      yield* TestHost.settle
      assert.include(root.text(), "bumps 2")
      assert.strictEqual(panelViews, 0)
      assert.deepStrictEqual(paths(root, "PropsChanged"), [])
    })))

  it.effect("content resolves services where the parent declared the child, not from the child's Layer", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      const text = root.text()
      // Panel's own badge first, then the one in the content Page wrote.
      assert.include(text, "page's")
      assert.include(text, "panel's")
      assert.isBelow(text.indexOf("page's"), text.indexOf("panel's"))
    })))

  it.effect("unplacing a slot unmounts its content, which starts over when placed again", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "type 0")
      yield* TestHost.settle
      click(root, "toggle")
      yield* TestHost.settle
      assert.notInclude(root.text(), "bumps")
      assert.include(root.text(), "footer 0")
      assert.include(paths(root, "Unmounted"), "/Page/Panel[details]/[body]/Editor[Draft]")
      click(root, "toggle")
      yield* TestHost.settle
      assert.include(root.text(), "type 0")
    })))

  it.effect("an outlet keeps its content across siblings that come and go, and loses it when it moves", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "type 0")
      yield* TestHost.settle
      click(root, "note")
      yield* TestHost.settle
      assert.include(root.text(), "a note")
      assert.include(root.text(), "type 1")
      assert.notInclude(paths(root, "Unmounted"), "/Page/Panel[details]/[body]/Editor[Draft]")
      click(root, "move")
      yield* TestHost.settle
      assert.include(root.text(), "type 0")
      assert.include(paths(root, "Unmounted"), "/Page/Panel[details]/[body]/Editor[Draft]")
    })))

  it.effect("an unfilled slot adds no element and no text", () =>
    provideHost(Effect.gen(function*() {
      const Bare = Component.define({ name: "Bare", model: Schema.Null, message: Schema.Never, elements: Html })
        .make({ init: () => null, update: (m) => m, view: (_, h) => Panel(h, { key: "p" }) })
      const root = yield* TestHost.mount(Bare, {})
      yield* TestHost.settle
      const footer = root.get(Query.tag("footer")) as TestHost.TestElement
      assert.isTrue(footer.children.every((child) => !("tag" in child) && child.text === ""))
    })))

  it.effect("$.send reaches a child in placed content by its ref, and is dropped while the slot isn't placed", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "type 0")
      yield* TestHost.settle
      click(root, "clear")
      yield* TestHost.settle
      assert.include(root.text(), "type 0")
      assert.include(updates(root), "/Page/Panel[details]/[body]/Editor[Draft] Send Clear")
      click(root, "toggle")
      yield* TestHost.settle
      click(root, "clear")
      yield* TestHost.settle
      const dropped = root.log().filter((entry): entry is MessageLog.SendDropped => entry._tag === "SendDropped")
      assert.deepStrictEqual(dropped.map((entry) => entry.reason), ["unrendered"])
    })))

  it.effect("a child failing in content shows its fallback, and its onFailure reaches the parent", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "break 0")
      yield* TestHost.settle
      assert.include(root.text(), "editor down")
      assert.include(root.text(), "editor failed")
      assert.deepStrictEqual(failures(root), ["/Page/Panel[details]/[body]/Editor[Draft] update"])
    })))

  it.effect("a DOM ref in content resolves for the parent that wrote it", () =>
    provideHost(Effect.gen(function*() {
      const Field = Renderer.ref<HTMLInputElement>("Field")
      const RefMsg = Schema.TaggedUnion({ Found: { found: Schema.Boolean } })
      const Look = Command.make("Look", { args: {} }, () =>
        Effect.gen(function*() {
          const refs = yield* Renderer.Refs
          const node = yield* refs.lookup(Field)
          return RefMsg.make({ _tag: "Found", found: Option.isSome(node) })
        }))
      const Form = Component.define({
        name: "Form",
        model: Schema.optional(Schema.Boolean),
        message: RefMsg,
        elements: Html
      }).make({
        init: ($) => $.set(undefined).run(Look()),
        update: (_, msg) => msg.found,
        view: (_, h) => Panel(h, { key: "p", slots: { body: h.input.ref(Field) } })
      })
      const root = yield* TestHost.mount(Form, {})
      yield* TestHost.settle
      assert.strictEqual(root.model(), true)
    })))

  describe("forwarding", () => {
    const Inner = Component.define({
      name: "Inner",
      model: Schema.Null,
      message: Schema.Never,
      elements: Html,
      slots: ["inner"]
    }).make({ init: () => null, update: (m) => m, view: (_, h) => h.div(h.slots.inner) })
    const OuterMsg = Schema.TaggedUnion({ Hide: {} })
    const Outer = Component.define({
      name: "Outer",
      model: Schema.Boolean,
      message: OuterMsg,
      elements: Html,
      slots: ["body"]
    }).make({
      init: () => true,
      update: () => false,
      view: (shown, h) =>
        h.div(
          h.button.onClick(OuterMsg.make({ _tag: "Hide" })).children("hide"),
          shown && Inner(h, { key: "i", slots: { inner: h.slots.body } })
        )
    })
    const Top = Component.define({ name: "Top", model: Schema.Number, message: PageMsg, elements: Html }).make({
      init: () => 0,
      update: (n, msg) => msg._tag === "Changed" ? msg.count : n,
      view: (n, h) =>
        h.div(
          Outer(h, {
            key: "o",
            slots: {
              body: Editor(h, { key: "e", onEmit: (e) => PageMsg.make({ _tag: "Changed", count: e.count }) })
            }
          }),
          h.output("top " + n)
        )
    })

    it.effect("keeps the content's path under the first receiver, and closes it with the instance that places it", () =>
      provideHost(Effect.gen(function*() {
        const root = yield* TestHost.mount(Top, {})
        click(root, "type 0")
        yield* TestHost.settle
        assert.include(root.text(), "top 1")
        assert.deepStrictEqual(updates(root), [
          "/Top/Outer[o]/[body]/Editor[e] DomEvent Typed",
          "/Top Emit Changed"
        ])
        click(root, "hide")
        yield* TestHost.settle
        assert.notInclude(root.text(), "type")
        assert.include(paths(root, "Unmounted"), "/Top/Outer[o]/[body]/Editor[e]")
      })))
  })

  describe("mistakes", () => {
    // `Writer` under a parent that shows a fallback when it fails.
    const holder = (Writer: Component.Mountable<{}, never>) =>
      Component.define({ name: "Top", model: Schema.Null, message: Schema.Never, elements: Html }).make({
        init: () => null,
        update: (m) => m,
        view: (_, h) => h.div(Writer(h, { key: "h", fallback: () => h.p("holder down") }))
      })
    const writer = Component.define({ name: "Writer", model: Schema.Null, message: Schema.Never, elements: Html })

    it.effect("placing a slot twice fails the child, a forwarded placement included", () =>
      provideHost(Effect.gen(function*() {
        const Inner = Component.define({
          name: "Inner",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["inner"]
        }).make({ init: () => null, update: (m) => m, view: (_, h) => h.div(h.slots.inner) })
        const child = <const Name extends string>(name: Name) =>
          Component.define({ name, model: Schema.Null, message: Schema.Never, elements: Html, slots: ["body"] })
        const Twice = child("Twice").make({
          init: () => null,
          update: (m) => m,
          view: (_, h) => h.div(h.slots.body, h.slots.body)
        })
        const Forwards = child("Forwards").make({
          init: () => null,
          update: (m) => m,
          view: (_, h) => h.div(h.slots.body, Inner(h, { key: "i", slots: { inner: h.slots.body } }))
        })
        for (const [name, Child] of [["Twice", Twice], ["Forwards", Forwards]] as const) {
          const Holder = Component.define({ name: "Holder", model: Schema.Null, message: Schema.Never, elements: Html })
            .make({
              init: () => null,
              update: (m) => m,
              view: (_, h) => Child(h, { key: "c", slots: { body: "x" }, fallback: () => h.p("child down") })
            })
          const root = yield* TestHost.mount(Holder, {})
          assert.include(root.text(), "child down")
          assert.deepStrictEqual(failures(root), [`/Holder/${name}[c] view`])
        }
      })))

    it.effect("a duplicate element key in content fails the parent that wrote it, not the child", () =>
      provideHost(Effect.gen(function*() {
        const Writer = writer.make({
          init: () => null,
          update: (m) => m,
          view: (_, h) => Panel(h, { key: "p", slots: { body: [h.li.key("a"), h.li.key("a")] } })
        })
        const root = yield* TestHost.mount(holder(Writer), {})
        yield* TestHost.settle
        assert.include(root.text(), "holder down")
        assert.deepStrictEqual(failures(root), ["/Top/Writer[h] view"])
      })))

    it.effect("a child ref key used in the view and in content fails the parent", () =>
      provideHost(Effect.gen(function*() {
        const Writer = writer.make({
          init: () => null,
          update: (m) => m,
          view: (_, h) =>
            h.div(Editor(h, { ref: Draft }), Panel(h, { key: "p", slots: { body: Editor(h, { ref: Draft }) } }))
        })
        const root = yield* TestHost.mount(holder(Writer), {})
        yield* TestHost.settle
        assert.include(root.text(), "holder down")
        assert.deepStrictEqual(failures(root), ["/Top/Writer[h] view"])
      })))

    it.effect("text in content placed where the vocabulary allows none fails the parent", () =>
      provideHost(Effect.gen(function*() {
        const Boxed = Component.define({
          name: "Boxed",
          model: Schema.Null,
          message: Schema.Never,
          elements: Tiny,
          slots: ["body"]
          // `h.el` checks for text when it's called, and the outlet's content when it's built.
        }).make({ init: () => null, update: (m) => m, view: (_, h) => h.el("box", h.slots.body) })
        const Writer = Component.define({ name: "Writer", model: Schema.Null, message: Schema.Never, elements: Tiny })
          .make({
            init: () => null,
            update: (m) => m,
            view: (_, h) => Boxed(h, { key: "b", slots: { body: "loose" } })
          })
        const Top = Component.define({ name: "Top", model: Schema.Null, message: Schema.Never, elements: Tiny })
          .make({
            init: () => null,
            update: (m) => m,
            view: (_, h) => h.box(Writer(h, { key: "w", fallback: () => h.label("writer down") }))
          })
        const root = yield* TestHost.mount(Top, {})
        yield* TestHost.settle
        assert.include(root.text(), "writer down")
        assert.deepStrictEqual(failures(root), ["/Top/Writer[w] view"])
      })))
  })
})

describe("checks on content", () => {
  const Frame = Component.define({
    name: "Frame",
    model: Schema.Null,
    message: Schema.Never,
    elements: Html,
    slots: ["body"]
  })
  const Leaf = Component.define({ name: "Leaf", model: Schema.Null, message: Schema.Never, elements: Html }).make({
    init: () => null,
    update: (model) => model,
    view: (_, h) => h.p("leaf")
  })
  const Broken = Component.define({ name: "Broken", model: Schema.Null, message: Schema.Never, elements: Html }).make({
    init: () => {
      throw new Error("broke")
    },
    update: (model) => model,
    view: (_, h) => h.p("broken")
  })
  const Headless = Component.define({ name: "Headless", model: Schema.Null, message: Schema.Never, elements: Html })
    .make({ init: () => null, update: (model) => model, parts: () => ({}) })
  const holding = (Writer: Component.Mountable<{}, never>) =>
    Component.define({ name: "Top", model: Schema.Null, message: Schema.Never, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => Writer(h, { key: "w", fallback: () => h.p("writer down") })
    })

  it.effect("a fallback in content that clashes with a sibling's path fails the content's author", () =>
    provideHost(Effect.gen(function*() {
      const Body = Frame.make({ init: () => null, update: (model) => model, view: (_, h) => h.div(h.slots.body) })
      const Writer = Component.define({ name: "Writer", model: Schema.Null, message: Schema.Never, elements: Html })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            Body(h, {
              key: "f",
              slots: { body: [Leaf(h, { key: "a" }), Broken(h, { key: "b", fallback: () => Leaf(h, { key: "a" }) })] }
            })
        })
      const root = yield* TestHost.mount(holding(Writer), {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "writer down")
      assert.include(failures(root), "/Top/Writer[w] view")
    })))

  it.effect("a forwarded slot keeps the text restriction of where it's placed, and fails the text's author", () =>
    provideHost(Effect.gen(function*() {
      const Inner = Component.define({
        name: "Inner",
        model: Schema.Null,
        message: Schema.Never,
        elements: Tiny,
        slots: ["inner"]
      }).make({ init: () => null, update: (model) => model, view: (_, h) => h.el("box", h.slots.inner) })
      const Outer = Component.define({
        name: "Outer",
        model: Schema.Null,
        message: Schema.Never,
        elements: Tiny,
        slots: ["body"]
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => Inner(h, { key: "i", slots: { inner: h.slots.body } })
      })
      const Writer = Component.define({ name: "Writer", model: Schema.Null, message: Schema.Never, elements: Tiny })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => Outer(h, { key: "o", slots: { body: "loose" } })
        })
      const Top = Component.define({ name: "Top", model: Schema.Null, message: Schema.Never, elements: Tiny }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => Writer(h, { key: "w", fallback: () => h.label("writer down") })
      })
      const root = yield* TestHost.mount(Top, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "writer down")
      assert.deepStrictEqual(failures(root), ["/Top/Writer[w] view"])
    })))

  it.effect("placing a slot in the view and in a headless child's closure fails the receiver", () =>
    provideHost(Effect.gen(function*() {
      const Twice = Frame.make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.div(h.slots.body, Headless(h, { key: "h", view: () => h.slots.body }))
      })
      const Writer = Component.define({ name: "Writer", model: Schema.Null, message: Schema.Never, elements: Html })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => Twice(h, { key: "f", slots: { body: "body" }, fallback: () => h.p("child down") })
        })
      const root = yield* TestHost.mount(Writer, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "child down")
      assert.deepStrictEqual(failures(root), ["/Writer/Frame[f] view"])
    })))

  it.effect("a slot placed once by the view and once in content it forwards through a headless closure is fine", () =>
    provideHost(Effect.gen(function*() {
      const Inner = Frame.make({ init: () => null, update: (model) => model, view: (_, h) => h.div(h.slots.body) })
      const Forward = Component.define({
        name: "Forward",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html,
        slots: ["body", "aside"]
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) =>
          h.div(
            h.slots.aside,
            Inner(h, { key: "i", slots: { body: Headless(h, { key: "h", view: () => h.slots.body }) } })
          )
      })
      const Writer = Component.define({ name: "Writer", model: Schema.Null, message: Schema.Never, elements: Html })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => Forward(h, { key: "f", slots: { body: "body", aside: "aside" } })
        })
      const root = yield* TestHost.mount(Writer, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "asidebody")
      assert.deepStrictEqual(failures(root), [])
    })))

  it.effect("navigating away from a view with a placed slot succeeds", () =>
    Effect.gen(function*() {
      const Body = Frame.make({ init: () => null, update: (model) => model, view: (_, h) => h.div(h.slots.body) })
      const Page = Component.define({ name: "Page", model: Schema.Null, message: Schema.Never, elements: Html }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => Body(h, { key: "f", slots: { body: Leaf(h, { key: "leaf" }) } })
      })
      yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      const router = yield* Router.Router
      assert.strictEqual(yield* router.navigate("/next"), "navigated")
    }).pipe(
      Effect.provide(Router.memory({ routes: Route.union({ Home: Route.make("/"), Next: Route.make("/next") }) })),
      provideHost
    ))
})
