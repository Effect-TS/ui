// @vitest-environment happy-dom
import { Command, Component, MessageLog, Renderer, Route, Router, UiSchema } from "@effect/ui"
import { BrowserHost, BrowserRouter, Html } from "@effect/ui/html"
import * as Executor from "@effect/ui/internal/executor"
import type * as runtime from "@effect/ui/internal/runtime"
import { expect, it } from "@effect/vitest"
import { Context, Effect, Exit, Layer, Schema, Scope } from "effect"
import { describe } from "vitest"

const GalleryRoute = Route.union({ Grid: Route.make("/"), Detail: Route.make("/detail") })
const Layout = Schema.Literals(["grid", "list"])
const Message = UiSchema.TaggedEnum({
  ClickedLayout: { layout: Layout },
  TypedFilter: { value: Schema.String },
  ClickedOpen: {},
  ChangedRoute: { route: GalleryRoute }
})

const CardMessage = UiSchema.TaggedEnum({ ClickedLike: {} })

const Card = Component.define({
  name: "Card",
  scoped: false,
  props: Schema.Struct({ layout: Layout }),
  model: Schema.Struct({ likes: Schema.Number }),
  message: CardMessage,
  elements: Html
}).make({
  init: () => ({ likes: 0 }),
  update: { ClickedLike: (model, _, $) => $.evolve({ likes: model.likes + 1 }) },
  view: (model, h) => h.button.onClick(CardMessage.ClickedLike()).children(`Like ${model.likes}`)
})

const Gallery = Component.define({
  name: "Gallery",
  scoped: false,
  props: Schema.Struct({ route: GalleryRoute }),
  model: Schema.Struct({ route: GalleryRoute, layout: Layout, filter: Schema.String }),
  message: Message,
  elements: Html
}).make({
  init: ($) => ({ route: $.props.route, layout: "grid" as const, filter: "" }),
  update: {
    ClickedLayout: (_, { layout }, $) => $.evolve({ layout }).viewTransition(["layout-change"]),
    TypedFilter: (_, { value }, $) => $.evolve({ filter: value }),
    ClickedOpen: (_, __, $) => $.run(Router.push(GalleryRoute, GalleryRoute.Detail()).pipe(Command.asNoop)),
    ChangedRoute: (_, { route }, $) => $.evolve({ route }).viewTransition(["to-detail"])
  },
  subscriptions: (model) => [
    Router.subscription(GalleryRoute, model.route, (route) => Message.ChangedRoute({ route }))
  ],
  view: (model, h) =>
    h.main(
      h.p(`${model.route._tag} ${model.layout} ${model.filter}`),
      h.button.onClick(Message.ClickedLayout({ layout: "grid" })).children("Grid"),
      h.button.onClick(Message.ClickedLayout({ layout: "list" })).children("List"),
      h.button.onClick(Message.ClickedOpen()).children("Open"),
      h.input.attr("aria-label", "Filter").onInput(({ value }) => Message.TypedFilter({ value })),
      Card(h, { props: { layout: model.layout } })
    )
})

const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))

interface Started {
  readonly update: () => void
  readonly types?: ReadonlyArray<string> | undefined
}

const fakeTransitions = (options?: { readonly reducedMotion?: boolean }) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const started: Array<Started> = []
      let skipped = 0
      const globals = window as unknown as Record<string, unknown>
      const matchMedia = window.matchMedia
      globals.ViewTransition = class {
        get types() {
          return new Set()
        }
      }
      ;(document as unknown as Record<string, unknown>).startViewTransition = (update: (() => void) | Started) => {
        started.push(typeof update === "function" ? { update } : update)
        const done = Promise.resolve()
        return { ready: done, finished: done, updateCallbackDone: done, skipTransition: () => skipped++ }
      }
      if (options?.reducedMotion === true) {
        window.matchMedia = (query) => ({ ...matchMedia.call(window, query), matches: true })
      }
      return { started, skipped: () => skipped, restore: () => (window.matchMedia = matchMedia) }
    }),
    ({ restore }) =>
      Effect.sync(() => {
        restore()
        delete (document as unknown as Record<string, unknown>).startViewTransition
        delete (window as unknown as Record<string, unknown>).ViewTransition
      })
  )

const mount = Effect.fnUntraced(function*(executor: Executor.Executor) {
  window.history.replaceState(null, "", "/")
  const log = MessageLog.makeMemory()
  const app = yield* Effect.acquireRelease(
    Effect.sync(() => document.body.appendChild(document.createElement("div"))),
    (element) => Effect.sync(() => element.remove())
  )
  const browser = yield* Layer.build(BrowserHost.layer())
  const host = Context.get(browser, Renderer.Renderer).host
  let commits = 0
  const counted: Renderer.Host<unknown> = {
    ...host,
    commit: () => {
      commits++
      host.commit?.()
    }
  }
  const context = Context.merge(browser, yield* Layer.build(BrowserRouter.layer({ routes: GalleryRoute }))).pipe(
    Context.add(Renderer.Renderer, { host: counted }),
    Context.add(MessageLog.MessageLog, log),
    Context.add(Executor.CurrentExecutor, executor)
  )
  const root = yield* Effect.flatMap(
    Router.currentRoute(GalleryRoute),
    (route) => Renderer.mount(Gallery, { route }, app)
  ).pipe(Effect.provideContext(context))
  const click = (label: string) =>
    [...app.querySelectorAll("button")].find((button) => button.textContent === label)!.click()
  const type = (value: string) => {
    const input = app.querySelector("input")!
    input.value = value
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }
  return {
    log,
    click,
    type,
    commits: () => commits,
    freeze: () => (root as unknown as runtime.Root).freeze(),
    shown: () => app.querySelector("p")!.textContent,
    card: () => app.querySelector("main > button:last-child")!.textContent
  }
})

const start = mount(Executor.microtask)

const held = Effect.gen(function*() {
  const tasks: Array<() => void> = []
  const app = yield* mount({ scheduler: undefined, schedule: (task) => tasks.push(task) })
  const runTasks = () => {
    while (tasks.length > 0) tasks.shift()!()
  }
  return { ...app, tasks, runTasks }
})

describe("view transitions", { concurrent: false }, () => {
  it.effect("an update that asks for one commits in the browser's callback, with what arrives meanwhile", () =>
    Effect.gen(function*() {
      const transitions = yield* fakeTransitions()
      const { click, log, shown, type } = yield* start
      click("List")
      yield* tick
      expect(shown()).toBe("Grid grid ")
      expect(transitions.started.map((started) => started.types)).toEqual([["layout-change"]])
      type("a")
      yield* tick
      expect(shown()).toBe("Grid grid ")
      transitions.started[0]!.update()
      expect(shown()).toBe("Grid list a")
      type("ab")
      yield* tick
      expect(shown()).toBe("Grid list ab")
      expect(transitions.started).toHaveLength(1)
      const updates = log.entries().filter((entry) => entry._tag === "Update")
      expect(updates.map((entry) => entry.viewTransition)).toEqual([["layout-change"], undefined, undefined])
    }).pipe(Effect.scoped))

  it.effect("a route change that a navigation delivers within the flush still animates", () =>
    Effect.gen(function*() {
      const transitions = yield* fakeTransitions()
      const { click, shown } = yield* start
      click("Open")
      yield* tick
      expect(transitions.started.map((started) => started.types)).toEqual([["to-detail"]])
      expect(shown()).toBe("Grid grid ")
      transitions.started[0]!.update()
      expect(shown()).toBe("Detail grid ")
    }).pipe(Effect.scoped))

  it.effect("without the API, or with reduced motion, the update commits at once", () =>
    Effect.gen(function*() {
      for (const setup of [Effect.void, Effect.asVoid(fakeTransitions({ reducedMotion: true }))]) {
        yield* Effect.gen(function*() {
          yield* setup
          const { click, shown } = yield* start
          click("List")
          yield* tick
          expect(shown()).toBe("Grid list ")
        }).pipe(Effect.scoped)
      }
    }))

  it.effect("closing the root skips its transition, and the held flush never runs", () =>
    Effect.gen(function*() {
      const transitions = yield* fakeTransitions()
      const scope = yield* Scope.make()
      const { click, log } = yield* Scope.provide(start, scope)
      click("List")
      yield* tick
      yield* Scope.close(scope, Exit.void)
      expect(transitions.skipped()).toBe(1)
      const logged = log.entries().length
      transitions.started[0]!.update()
      expect(log.entries()).toHaveLength(logged)
    }).pipe(Effect.scoped))

  it.effect("a flush queued before the hand-off commits nothing once the held flush has", () =>
    Effect.gen(function*() {
      const transitions = yield* fakeTransitions()
      for (const consume of ["callback", "freeze", "close"] as const) {
        yield* Effect.gen(function*() {
          const scope = yield* Scope.make()
          const app = yield* Scope.provide(held, scope)
          const before = transitions.started.length
          app.click("Open")
          while (transitions.started.length === before) {
            if (app.tasks.length > 0) app.tasks.shift()!()
            else yield* tick
          }
          const queued = app.tasks.length
          const commits = app.commits()
          if (consume === "callback") transitions.started.at(-1)!.update()
          else if (consume === "freeze") app.freeze()
          else yield* Scope.close(scope, Exit.void)
          app.runTasks()
          expect({ consume, queued: queued > 0, commits: app.commits() }).toEqual({
            consume,
            queued: true,
            commits: commits + 1
          })
          yield* Scope.close(scope, Exit.void)
        })
      }
    }).pipe(Effect.scoped))

  it.effect("a child's message waits for its parent's transition, and reads the props it gives", () =>
    Effect.gen(function*() {
      const transitions = yield* fakeTransitions()
      const { card, click, log, runTasks, shown } = yield* held
      for (const flushFirst of [true, false]) {
        click(flushFirst ? "List" : "Grid")
        if (flushFirst) runTasks()
        click(card())
        runTasks()
        expect(shown()).toBe(flushFirst ? "Grid grid " : "Grid list ")
        expect(transitions.started).toHaveLength(flushFirst ? 1 : 2)
        transitions.started.at(-1)!.update()
        runTasks()
        expect(shown()).toBe(flushFirst ? "Grid list " : "Grid grid ")
        const liked = log.entries().filter((entry) => entry._tag === "Update" && entry.path !== "Gallery[]")
        expect((liked.at(-1) as MessageLog.Update).props).toEqual({ layout: flushFirst ? "list" : "grid" })
      }
      expect(card()).toBe("Like 2")
    }).pipe(Effect.scoped))

  it.effect("freezing settles a requested transition's update at once, without starting one", () =>
    Effect.gen(function*() {
      const transitions = yield* fakeTransitions()
      const { click, commits, freeze, shown } = yield* held
      const before = commits()
      click("List")
      freeze()
      expect(shown()).toBe("Grid list ")
      expect(transitions.started).toHaveLength(0)
      expect(commits()).toBe(before + 1)
    }).pipe(Effect.scoped))
})
