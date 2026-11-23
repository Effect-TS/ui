// @vitest-environment happy-dom
import { Component, Feature, UiSchema } from "@effect/ui"
import { BrowserHost, Html } from "@effect/ui/html"
import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))

const CounterMessage = UiSchema.TaggedEnum({ Clicked: {} })
const Counter = Component.define({
  name: "Counter",
  scoped: false,
  model: Schema.Number,
  message: CounterMessage,
  elements: Html
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h, count) => h.button.onClick(CounterMessage.Clicked()).children(`clicked ${count}`)
})

it.effect("pause paints a frozen copy beside the hidden container, and resume shows the live tree again", () =>
  Effect.gen(function*() {
    const app = document.body.appendChild(document.createElement("main"))
    app.className = "app"
    app.style.display = "grid"
    yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
    const roots: Array<BrowserHost.Pausable> = []
    const root = yield* BrowserHost.mountEffect(Counter, {}, app).pipe(
      Effect.provideService(BrowserHost.Pausables, {
        register: (root) => {
          roots.push(root)
          return () => roots.splice(roots.indexOf(root), 1)
        }
      })
    )
    expect(roots.map((root) => root.path)).toEqual(["/Counter"])
    const [pausable] = roots

    const painted = yield* pausable.pause((path) => path === "/Counter" ? { model: 7 } : undefined)
    expect(painted).toEqual({ fellBack: [], fallbacks: [] })
    const copy = app.nextElementSibling as HTMLElement
    expect(copy.outerHTML).toBe(
      "<main class=\"app\" style=\"display: grid;\" inert=\"\"><button>clicked 7</button></main>"
    )
    expect(app.style.getPropertyValue("display")).toBe("none")

    root.send(CounterMessage.Clicked())
    copy.querySelector("button")!.click()
    yield* tick
    expect(app.textContent).toBe("clicked 1")
    expect(copy.textContent).toBe("clicked 7")

    yield* pausable.pause(() => undefined)
    expect(document.querySelectorAll("[inert]").length).toBe(1)
    expect(app.nextElementSibling!.outerHTML).toBe(
      "<main class=\"app\" style=\"display: grid;\" inert=\"\"><button>clicked 0</button></main>"
    )

    yield* pausable.resume
    expect(document.querySelectorAll("[inert]").length).toBe(0)
    expect(app.style.getPropertyValue("display")).toBe("grid")
    expect(app.textContent).toBe("clicked 1")
  }).pipe(Effect.scoped))

class Editor extends Feature.Service<Editor>()("Pause/Editor", { props: Schema.Struct({}) }) {}
const EditorView = Component.define({
  name: "EditorView",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({ init: () => null, update: ($) => $.model, view: (h) => h.span("editor") })

const Note = Component.define({
  name: "Note",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
})
  .make({ init: () => null, update: ($) => $.model, view: (h) => h.span("note") })

const Pane = Component.define({
  name: "Pane",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
})
  .make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
      h.div(
        Editor.render(h, { key: "e", props: {}, fallback: () => h.span("loading") }),
        Note(h, { key: "n" })
      )
  })
  .pipe(Component.provide(Editor.toLayer(EditorView)))

const Page = Component.define({
  name: "Page",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
})
  .make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.main(Pane(h, { key: "p" }), Note(h, { key: "n" }))
  })

it.effect("pause reports the instances whose feature slot shows its fallback in the copy", () =>
  Effect.gen(function*() {
    const app = document.body.appendChild(document.createElement("div"))
    yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
    const roots: Array<BrowserHost.Pausable> = []
    yield* BrowserHost.mountEffect(Page, {}, app).pipe(
      Effect.provideService(BrowserHost.Pausables, { register: (root) => (roots.push(root), () => {}) })
    )
    yield* tick
    expect(app.textContent).toBe("editornotenote")

    const painted = yield* roots[0].pause(() => ({ model: null }))
    expect(app.nextElementSibling!.textContent).toBe("loadingnotenote")
    expect(painted).toEqual({ fellBack: [], fallbacks: ["/Page/Pane[p]"] })
    yield* roots[0].resume
  }).pipe(Effect.scoped))
