// @vitest-environment happy-dom
import { Component, Feature, Mount, UiSchema } from "@effect/ui"
import { BrowserHost, Html } from "@effect/ui/html"
import { expect, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"

const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))

const place = Effect.fnUntraced(function*(tag: string = "div") {
  const page = document.body.appendChild(document.createElement("section"))
  yield* Effect.addFinalizer(() => Effect.sync(() => page.remove()))
  return { page, app: page.appendChild(document.createElement(tag)) }
})

const CounterMessage = UiSchema.TaggedEnum({ Clicked: {} })
let mounts = 0
const Seen = Mount.make("Seen", { args: {} }, () => Effect.sync(() => mounts++))
const Counter = Component.define({
  name: "Counter",
  scoped: false,
  model: Schema.Number,
  message: CounterMessage,
  elements: Html
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h, count) =>
    h.button.onClick(CounterMessage.Clicked()).onMount(Seen().pipe(Mount.map(() => Component.noop)))
      .children(`clicked ${count}`)
})

const register = (roots: Array<BrowserHost.Pausable>) =>
  Effect.provideService(BrowserHost.Pausables, {
    register: (root) => {
      roots.push(root)
      return () => roots.splice(roots.indexOf(root), 1)
    }
  })

it.effect("pause paints a frozen copy beside the hidden container, and resume shows the live tree again", () =>
  Effect.gen(function*() {
    const { app, page } = yield* place("main")
    app.className = "app"
    app.style.display = "grid"
    const roots: Array<BrowserHost.Pausable> = []
    const root = yield* BrowserHost.mountEffect(Counter, {}, app).pipe(register(roots))
    expect(roots.map((root) => root.path)).toEqual(["/Counter"])
    const [pausable] = roots
    const mounted = mounts

    const painted = yield* pausable.pause((path) => path === "/Counter" ? { model: 7 } : undefined)
    expect(painted).toEqual({ fellBack: [], fallbacks: [] })
    const copy = app.nextElementSibling as HTMLElement
    expect(copy.outerHTML).toBe(
      "<main class=\"app\" style=\"display: grid;\" inert=\"\"><button>clicked 7</button></main>"
    )
    expect(app.style.getPropertyValue("display")).toBe("none")
    expect(mounts).toBe(mounted)

    root.send(CounterMessage.Clicked())
    copy.querySelector("button")!.click()
    yield* tick
    expect(app.textContent).toBe("clicked 1")
    expect(copy.textContent).toBe("clicked 7")

    yield* pausable.pause(() => undefined)
    expect(page.querySelectorAll("[inert]").length).toBe(1)
    expect(app.nextElementSibling!.outerHTML).toBe(
      "<main class=\"app\" style=\"display: grid;\" inert=\"\"><button>clicked 0</button></main>"
    )

    yield* pausable.resume
    expect(page.querySelectorAll("[inert]").length).toBe(0)
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
    const { app } = yield* place()
    const roots: Array<BrowserHost.Pausable> = []
    yield* BrowserHost.mountEffect(Page, {}, app).pipe(register(roots))
    yield* tick
    expect(app.textContent).toBe("editornotenote")

    const painted = yield* roots[0].pause(() => ({ model: null }))
    expect(app.nextElementSibling!.textContent).toBe("loadingnotenote")
    expect(painted).toEqual({ fellBack: [], fallbacks: ["/Page/Pane[p]"] })
    yield* roots[0].resume
  }).pipe(Effect.scoped))

it.effect("a paint that fails removes its copy and leaves the page as it was", () =>
  Effect.gen(function*() {
    const { app, page } = yield* place()
    app.style.display = "grid"
    const roots: Array<BrowserHost.Pausable> = []
    yield* BrowserHost.mountEffect(Counter, {}, app).pipe(register(roots))
    const boom = () => {
      throw new Error("boom")
    }

    expect(Exit.isFailure(yield* Effect.exit(roots[0].pause(boom)))).toBe(true)
    expect(page.querySelectorAll("[inert]").length).toBe(0)
    expect(app.style.getPropertyValue("display")).toBe("grid")

    yield* roots[0].pause(() => ({ model: 3 }))
    expect(Exit.isFailure(yield* Effect.exit(roots[0].pause(boom)))).toBe(true)
    expect(Array.from(page.querySelectorAll("[inert]"), (copy) => copy.textContent)).toEqual(["clicked 3"])
    expect(app.style.getPropertyValue("display")).toBe("none")
    yield* roots[0].resume
    expect(app.style.getPropertyValue("display")).toBe("grid")
  }).pipe(Effect.scoped))

const DialogMessage = UiSchema.TaggedEnum({ Opened: {}, Closed: {} })
const Settings = Component.define({
  name: "Settings",
  scoped: false,
  model: Schema.Boolean,
  message: DialogMessage,
  elements: Html
}).make({
  init: () => false,
  update: (_, message) => message._tag === "Opened",
  view: (h, open) => h.dialog.modal(open).onCancel(DialogMessage.Closed()).children("settings")
})

it.effect("the live root's modal dialogs are closed while it's paused and shown again on resume", () =>
  Effect.gen(function*() {
    const { app } = yield* place()
    const roots: Array<BrowserHost.Pausable> = []
    const root = yield* BrowserHost.mountEffect(Settings, {}, app).pipe(register(roots))
    const dialog = app.querySelector("dialog")!
    root.send(DialogMessage.Opened())
    yield* tick
    expect(dialog.open).toBe(true)

    yield* roots[0].pause(() => ({ model: false }))
    expect(dialog.open).toBe(false)
    yield* roots[0].resume
    expect(dialog.open).toBe(true)

    root.send(DialogMessage.Closed())
    yield* tick
    yield* roots[0].pause(() => ({ model: false }))
    root.send(DialogMessage.Opened())
    yield* tick
    expect(dialog.open).toBe(false)
    yield* roots[0].resume
    expect(dialog.open).toBe(true)
    expect(root.model()).toBe(true)
  }).pipe(Effect.scoped))
