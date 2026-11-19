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
const detached = (root: Root) => root.log().flatMap((entry) => entry._tag === "Detached" ? [entry.path] : [])
const failures = (root: Root) =>
  root.log().flatMap((entry) => entry._tag === "Failed" ? [entry.path + " " + entry.in] : [])

const define = <const Name extends string>(name: Name) =>
  Component.define({ name, model: Schema.Null, message: Schema.Never, elements: Html })
const slotted = <const Name extends string>(name: Name) =>
  Component.define({ name, model: Schema.Null, message: Schema.Never, elements: Html, slots: ["body"] })
const Leaf = define("Leaf").make({ init: () => null, update: (m) => m, view: (_, h) => h.p("leaf") })

// Places its slot until "toggle" hides it.
let frameViews = 0
const Toggle = UiSchema.TaggedEnum({ Toggle: {} })
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
    return h.div(h.button.onClick(Toggle.Toggle()).children("toggle"), shown && h.slots.body)
  }
})

const EditorMsg = UiSchema.TaggedEnum({ Typed: {}, Clear: {}, Break: {} })
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
      h.button.onClick(EditorMsg.Typed()).children("type " + n),
      h.button.onClick(EditorMsg.Break()).children("break")
    )
})
const Draft = Editor.ref("Draft")

const PageMsg = UiSchema.TaggedEnum({ Changed: { count: Schema.Number }, Clear: {}, Failed: {} })
const Page = Component.define({ name: "Page", model: Schema.String, message: PageMsg, elements: Html }).make({
  init: () => "",
  update: (log, msg, $) =>
    msg._tag === "Clear"
      ? $.send(Draft, { _tag: "Clear" })
      : log + (msg._tag === "Changed" ? "changed " + msg.count : "failed"),
  view: (log, h) =>
    h.div(
      h.button.onClick(PageMsg.Clear()).children("clear"),
      Frame(h, {
        key: "f",
        slots: {
          body: [
            h.output(log),
            Editor(h, {
              ref: Draft,
              onEmit: (count) => PageMsg.Changed({ count }),
              onFailure: () => PageMsg.Failed(),
              fallback: () => h.span("editor down")
            })
          ]
        }
      })
    )
})
const editorPath = "/Page/Editor[Draft]"

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

  describe("a feature moved by its author", () => {
    const TallyMsg = UiSchema.TaggedEnum({ Counted: {} })
    class Tally extends Feature.Service<Tally>()("Tally", { props: Schema.Struct({}) }) {}
    const tally = (side: string) =>
      Tally.toLayer(
        Component.define({ name: "Tally", model: Schema.Number, message: TallyMsg, elements: Html }).make({
          init: () => 0,
          update: (n) => n + 1,
          view: (n, h) => h.button.onClick(TallyMsg.Counted()).children(side + " " + n)
        })
      )
    const lifecycle = (root: Root) =>
      root.log().flatMap((entry) =>
        (entry._tag === "Mounted" || entry._tag === "Unmounted") && entry.path === "/Wrap/Tally[t]" ? [entry._tag] : []
      )
    const Box = Component.define({ name: "Box", model: Schema.Null, message: Schema.Never, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      parts: () => ({})
    })
    const Placed = Schema.Literals(["direct", "slot", "box"])
    const Place = UiSchema.TaggedEnum({ Place: { at: Placed } })
    const Wrap = Component.define({ name: "Wrap", model: Placed, message: Place, elements: Html }).make({
      init: () => "direct" as const,
      update: (_, { at }) => at,
      view: (at, h) => {
        const t = Tally.render(h, { key: "t", fallback: () => h.span("no tally") })
        return at === "slot"
          ? Frame(h, { key: "f", slots: { body: t } })
          : at === "box"
          ? Box(h, { key: "b", view: () => h.section(t) })
          : h.div(t)
      }
    })

    it.effect("keeps its instance when its binding is the same where it lands", () =>
      provideHost(Effect.gen(function*() {
        const root = yield* TestHost.mount(Component.provide(Wrap, tally("left")), {})
        click(root, "left 0")
        yield* TestHost.settle
        root.send(Place.Place({ at: "slot" }))
        yield* TestHost.settle
        assert.include(root.text(), "left 1")
        // Through a headless closure that provides nothing.
        root.send(Place.Place({ at: "box" }))
        yield* TestHost.settle
        assert.include(root.text(), "left 1")
        assert.deepStrictEqual(lifecycle(root), ["Mounted"])
      })))

    it.effect("remounts when its author's keyed provide swaps the implementation as it moves", () =>
      provideHost(Effect.gen(function*() {
        const Keyed = Component.provide(Wrap, {
          key: (_: unknown, at: typeof Placed.Type) => (at === "direct" ? "left" : "right"),
          layer: (side: string) => tally(side)
        })
        const root = yield* TestHost.mount(Keyed, {})
        yield* TestHost.settle
        click(root, "left 0")
        yield* TestHost.settle
        root.send(Place.Place({ at: "slot" }))
        yield* TestHost.settle
        assert.include(root.text(), "right 0")
        assert.deepStrictEqual(lifecycle(root).slice(-1), ["Mounted"])
        assert.include(lifecycle(root), "Unmounted")
      })))
  })

  it.effect("unplacing a slot detaches its content, which comes back as it was when placed again", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      click(root, "type 0")
      click(root, "toggle")
      yield* TestHost.settle
      assert.notInclude(root.text(), "type")
      assert.deepStrictEqual(unmounted(root), [])
      assert.include(detached(root), editorPath)
      click(root, "toggle")
      yield* TestHost.settle
      assert.include(root.text(), "type 1")
      assert.deepStrictEqual(unmounted(root), [])
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
      const LateMsg = UiSchema.TaggedEnum({ Fill: {}, Hit: {} })
      const Late = Component.provide(
        Component.define({ name: "Late", model: Schema.Boolean, message: LateMsg, elements: Html }).make({
          init: () => false,
          update: () => true,
          view: (filled, h) =>
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

  it.effect("forwarded content keeps its author's path, and the receiver that places it detaches it", () =>
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
            slots: { body: Editor(h, { key: "e", onEmit: (count) => PageMsg.Changed({ count }) }) }
          })
      })
      const root = yield* TestHost.mount(Top, {})
      click(root, "type 0")
      yield* TestHost.settle
      assert.deepStrictEqual(updates(root), ["/Top/Editor[e] DomEvent Typed", "/Top Emit Changed"])
      click(root, "toggle")
      yield* TestHost.settle
      assert.deepStrictEqual(unmounted(root), [])
      assert.include(detached(root), "/Top/Editor[e]")
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

describe("Back to a page whose layout changed while away", () => {
  const Routes = Route.union({ Edit: Route.make("/"), Away: Route.make("/away") })
  const EditPage = Component.define({
    name: "EditPage",
    props: Schema.Struct({ slotted: Schema.Boolean }),
    model: Schema.Null,
    message: Schema.Never,
    elements: Html
  }).make({
    init: () => null,
    update: (model) => model,
    view: (_, h) => {
      const editor = Editor(h, { key: "e" })
      return h.props.slotted ? Frame(h, { key: "f", slots: { body: editor } }) : h.div(editor)
    }
  })
  const ShellMsg = UiSchema.TaggedEnum({ Routed: { route: Routes }, Slot: {} })
  const Shell = Component.define({
    name: "Shell",
    props: Schema.Struct({ route: Routes }),
    model: Schema.Struct({ route: Routes, slotted: Schema.Boolean }),
    message: ShellMsg,
    elements: Html
  }).make({
    init: ($) => ({ route: $.props.route, slotted: false }),
    update: (model, msg) => msg._tag === "Slot" ? { ...model, slotted: true } : { ...model, route: msg.route },
    subscriptions: (model) => [Router.subscription(Routes, model.route, (route) => ShellMsg.Routed({ route }))],
    view: (model, h) =>
      Routes.match(model.route, {
        Edit: (route) => EditPage(h, { key: Routes.print(route), props: { slotted: model.slotted } }),
        Away: () => h.p("away")
      })
  })
  const editor = "/Shell/EditPage[/]/Editor[e]"

  it.effect("an editor moved from the page into a slot is restored with its Model", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const root = yield* TestHost.mount(Shell, Router.props(Routes))
      yield* TestHost.settle
      click(root, "type 0")
      yield* TestHost.settle
      const router = yield* Router.Router
      yield* router.navigate("/away")
      yield* TestHost.settle
      root.send(ShellMsg.Slot())
      yield* TestHost.settle
      history.go(-1)
      yield* TestHost.settle
      assert.include(root.text(), "type 1")
      const mounted = root.log().filter((entry): entry is MessageLog.Mounted =>
        entry._tag === "Mounted" && entry.path === editor
      )
      assert.deepStrictEqual(mounted.map((entry) => entry.adopted), [false, true])
    }).pipe(Effect.provide(Router.make({ routes: Routes, history })), provideHost)
  })

  // The limit: a restore brings back what the restored views place. Content left in a closed slot isn't
  // placed until the slot opens, after the restore, so it starts fresh.
  it.effect("an editor left in a closed slot starts fresh when the slot opens after Back", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const root = yield* TestHost.mount(Shell, Router.props(Routes))
      click(root, "type 0")
      yield* TestHost.settle
      root.send(ShellMsg.Slot())
      yield* TestHost.settle
      assert.include(root.text(), "type 1")
      assert.deepStrictEqual(unmounted(root), [])
      click(root, "toggle")
      yield* TestHost.settle
      const router = yield* Router.Router
      yield* router.navigate("/away")
      yield* TestHost.settle
      history.go(-1)
      yield* TestHost.settle
      assert.notInclude(root.text(), "type")
      click(root, "toggle")
      yield* TestHost.settle
      assert.include(root.text(), "type 0")
      const mounted = root.log().filter((entry): entry is MessageLog.Mounted =>
        entry._tag === "Mounted" && entry.path === editor
      )
      assert.deepStrictEqual(mounted.map((entry) => entry.adopted), [false, false])
    }).pipe(Effect.provide(Router.make({ routes: Routes, history })), provideHost)
  })
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
