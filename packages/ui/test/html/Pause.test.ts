// @vitest-environment happy-dom
import { Component, Feature, MessageLog, Mount, UiSchema } from "@effect/ui"
import { BrowserHost, Html } from "@effect/ui/html"
import { expect, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"

const tick = Effect.promise(() =>
  new Promise<void>((resolve) => setTimeout(resolve, 30))
)

const place = Effect.fnUntraced(function*(tag: string = "div") {
  const page = document.body.appendChild(document.createElement("section"))
  yield* Effect.addFinalizer(() => Effect.sync(() => page.remove()))
  return { page, app: page.appendChild(document.createElement(tag)) }
})

const CounterMessage = UiSchema.TaggedEnum({ Clicked: {} })
let mounts = 0
const Seen = Mount.make("Seen", { args: {} }, () => Effect.sync(() => mounts++))
const Counter = Html.component({
  name: "Counter",
  model: Schema.Number,
  message: CounterMessage
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h, count) =>
    h.button.onClick(CounterMessage.Clicked()).onMount(
      Seen().pipe(Mount.map(() => Component.noop))
    )
      .children(`clicked ${count}`)
})

const register = (roots: Array<BrowserHost.Controllable>) =>
  Effect.provideService(BrowserHost.Controllables, {
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
    const roots: Array<BrowserHost.Controllable> = []
    const root = yield* BrowserHost.mountEffect(Counter, {}, app).pipe(
      register(roots)
    )
    expect(roots.map((root) => root.path)).toEqual(["/Counter"])
    const [pausable] = roots
    const mounted = mounts

    const painted = yield* pausable.pause((path) =>
      path === "/Counter" ? { model: 7 } : undefined
    )
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

const FieldMessage = UiSchema.TaggedEnum({ Typed: { value: Schema.String } })
const Field = Html.component({
  name: "Field",
  model: Schema.Struct({ value: Schema.String, typed: Schema.Number }),
  message: FieldMessage
}).make({
  init: () => ({ value: "", typed: 0 }),
  update: ($, { value }) => ({ value, typed: $.model.typed + 1 }),
  view: (h, { value }) =>
    h.input.value(value).onInput(({ value }) => FieldMessage.Typed({ value }))
})

it.effect("the copy's host listens only on the copy, so a live event while paused is reported once", () =>
  Effect.gen(function*() {
    const { app } = yield* place()
    const roots: Array<BrowserHost.Controllable> = []
    const root = yield* BrowserHost.mountEffect(Field, {}, app).pipe(
      register(roots)
    )
    yield* roots[0].pause(() => ({ model: { value: "copy", typed: 0 } }))
    const input = app.querySelector("input")!
    input.value = "live"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    yield* tick
    expect(root.model()).toEqual({ value: "live", typed: 1 })
    yield* roots[0].resume
  }).pipe(Effect.scoped))

class Editor extends Feature.Service<Editor>()("Pause/Editor", {
  props: Schema.Struct({})
}) {}
const EditorView = Html.component({
  name: "EditorView",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.span("editor")
})

const Note = Html.component({
  name: "Note",
  model: Schema.Null,
  message: Schema.Never
})
  .make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.span("note")
  })

const Pane = Html.component({
  name: "Pane",
  model: Schema.Null,
  message: Schema.Never
})
  .make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
      h.div(
        Editor.render(h, {
          key: "e",
          props: {},
          fallback: () => h.span("loading")
        }),
        Note(h, { key: "n" })
      )
  })
  .pipe(Component.provide(Editor.toLayer(EditorView)))

const Page = Html.component({
  name: "Page",
  model: Schema.Null,
  message: Schema.Never
})
  .make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.main(Pane(h, { key: "p" }), Note(h, { key: "n" }))
  })

it.effect("pause reports the instances whose feature slot shows its fallback in the copy", () =>
  Effect.gen(function*() {
    const { app } = yield* place()
    const roots: Array<BrowserHost.Controllable> = []
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
    const roots: Array<BrowserHost.Controllable> = []
    yield* BrowserHost.mountEffect(Counter, {}, app).pipe(register(roots))
    const boom = () => {
      throw new Error("boom")
    }

    expect(Exit.isFailure(yield* Effect.exit(roots[0].pause(boom)))).toBe(true)
    expect(page.querySelectorAll("[inert]").length).toBe(0)
    expect(app.style.getPropertyValue("display")).toBe("grid")

    yield* roots[0].pause(() => ({ model: 3 }))
    expect(Exit.isFailure(yield* Effect.exit(roots[0].pause(boom)))).toBe(true)
    expect(
      Array.from(page.querySelectorAll("[inert]"), (copy) => copy.textContent)
    ).toEqual(["clicked 3"])
    expect(app.style.getPropertyValue("display")).toBe("none")
    yield* roots[0].resume
    expect(app.style.getPropertyValue("display")).toBe("grid")
  }).pipe(Effect.scoped))

const DialogMessage = UiSchema.TaggedEnum({ Opened: {}, Closed: {} })
const Settings = Html.component({
  name: "Settings",
  model: Schema.Boolean,
  message: DialogMessage
}).make({
  init: () => false,
  update: (_, message) => message._tag === "Opened",
  view: (h, open) =>
    h.dialog.modal(open).onCancel(DialogMessage.Closed()).children("settings")
})

it.effect("the live root's modal dialogs are closed while it's paused and shown again on resume", () =>
  Effect.gen(function*() {
    const { app } = yield* place()
    const roots: Array<BrowserHost.Controllable> = []
    const root = yield* BrowserHost.mountEffect(Settings, {}, app).pipe(
      register(roots)
    )
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

const TallyMessage = UiSchema.TaggedEnum({
  Added: { by: Schema.Number },
  Broke: {}
})
const Tally = Html.component({
  name: "Tally",
  model: Schema.Number,
  message: TallyMessage
}).make({
  init: () => 0,
  update: ($, message) => {
    if (message._tag === "Broke") throw new Error("broke")
    return $.model + message.by
  },
  view: (h, total) => h.span(`total ${total}`)
})
const Board = Html.component({
  name: "Board",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.div(Tally(h, { key: "t" }))
})

const mountBoard = Effect.fnUntraced(function*() {
  const { app } = yield* place()
  const log = MessageLog.makeMemory()
  const roots: Array<BrowserHost.Controllable> = []
  yield* BrowserHost.mountEffect(Board, {}, app).pipe(
    register(roots),
    Effect.provideService(MessageLog.MessageLog, log)
  )
  const mounted = log.entries().find((entry) =>
    entry._tag === "Mounted" && entry.path === "/Board/Tally[t]"
  )!
  return {
    app,
    log,
    root: roots[0],
    tally: (mounted as MessageLog.Mounted).instance
  }
})

it.effect("a tool sends a message to an instance by its number, as a dispatch", () =>
  Effect.gen(function*() {
    const { app, log, root, tally } = yield* mountBoard()
    expect(root.instance(tally)).toMatchObject({
      instance: tally,
      path: "/Board/Tally[t]",
      component: "Tally",
      message: TallyMessage
    })
    expect(root.instance(tally + 100)).toBeUndefined()

    const outcome = yield* root.instance(tally)!.dispatch(
      TallyMessage.Added({ by: 2 })
    )
    expect(outcome._tag).toBe("Updated")
    expect(
      log.entries().find((entry) =>
        entry.seq === (outcome as { readonly seq: number }).seq
      )
    ).toMatchObject({
      _tag: "Update",
      path: "/Board/Tally[t]",
      source: { _tag: "Dispatch" },
      message: TallyMessage.Added({ by: 2 }),
      model: 2
    })
    yield* tick
    expect(app.textContent).toBe("total 2")
  }).pipe(Effect.scoped))

it.effect("a dispatch whose update throws tells the Failed entry, and the failed instance is gone", () =>
  Effect.gen(function*() {
    const { log, root, tally } = yield* mountBoard()

    const outcome = yield* root.instance(tally)!.dispatch(TallyMessage.Broke())
    expect(outcome._tag).toBe("Failed")
    expect(
      log.entries().find((entry) =>
        entry.seq === (outcome as { readonly seq: number }).seq
      )
    ).toMatchObject({
      _tag: "Failed",
      path: "/Board/Tally[t]",
      in: "update"
    })
    expect(root.instance(tally)).toBeUndefined()
  }).pipe(Effect.scoped))
