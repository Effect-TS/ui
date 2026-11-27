// @vitest-environment happy-dom
import {
  Command,
  MessageLog,
  Mount,
  Renderer,
  Route,
  Router,
  UiSchema
} from "@effect/ui"
import { BrowserHost, BrowserRouter, Html } from "@effect/ui/html"
import { HtmlLocator } from "@effect/ui/html/testing"
import * as domHost from "@effect/ui/internal/domHost"
import * as Executor from "@effect/ui/internal/executor"
import type * as runtime from "@effect/ui/internal/runtime"
import { expect, it } from "@effect/vitest"
import { Clock, Context, Effect, Exit, Layer, Schema, Scope } from "effect"
import { describe } from "vitest"

const GalleryRoute = Route.union({
  Grid: Route.make("/"),
  Detail: Route.make("/detail")
})
const Layout = Schema.Literals(["grid", "list"])
const Message = UiSchema.TaggedEnum({
  ClickedLayout: { layout: Layout },
  TypedFilter: { value: Schema.String },
  ClickedOpen: {},
  ChangedRoute: { route: GalleryRoute }
})

const CardMessage = UiSchema.TaggedEnum({ ClickedLike: {} })

const Card = Html.component({
  name: "Card",
  props: Schema.Struct({ layout: Layout }),
  model: Schema.Struct({ likes: Schema.Number }),
  message: CardMessage
}).make({
  init: () => ({ likes: 0 }),
  update: { ClickedLike: ($) => $.evolve({ likes: $.model.likes + 1 }) },
  view: (h, model) =>
    h.button.on("click", CardMessage.ClickedLike()).children(
      `Like ${model.likes}`
    )
})

const Gallery = Html.component({
  name: "Gallery",
  props: Schema.Struct({ route: GalleryRoute }),
  model: Schema.Struct({
    route: GalleryRoute,
    layout: Layout,
    filter: Schema.String
  }),
  message: Message
}).make({
  init: ($) => ({ route: $.props.route, layout: "grid" as const, filter: "" }),
  update: {
    ClickedLayout: ($, { layout }) =>
      $.evolve({ layout }).viewTransition(["layout-change"]),
    TypedFilter: ($, { value }) => $.evolve({ filter: value }),
    ClickedOpen: ($) =>
      $.run(
        Router.push(GalleryRoute, GalleryRoute.Detail()).pipe(Command.asNoop)
      ),
    ChangedRoute: ($, { route }) =>
      $.evolve({ route }).viewTransition(["to-detail"])
  },
  subscriptions: ({ model }) => [
    Router.subscription(
      GalleryRoute,
      model.route,
      (route) => Message.ChangedRoute({ route })
    )
  ],
  view: (h, model) =>
    h.main(
      h.p(`${model.route._tag} ${model.layout} ${model.filter}`),
      h.button.on("click", Message.ClickedLayout({ layout: "grid" })).children(
        "Grid"
      ),
      h.button.on("click", Message.ClickedLayout({ layout: "list" })).children(
        "List"
      ),
      h.button.on("click", Message.ClickedOpen()).children("Open"),
      h.input.attr("aria-label", "Filter").on("input", ({ value }) =>
        Message.TypedFilter({ value })),
      Card(h, { props: { layout: model.layout } })
    )
})

const tick = Effect.promise(() =>
  new Promise<void>((resolve) => setTimeout(resolve, 30))
)

interface Started {
  readonly update: () => void
  readonly types?: ReadonlyArray<string> | undefined
}

const win = window as unknown as Record<string, unknown>
const doc = document as unknown as Record<string, unknown>
const matchMedia = window.matchMedia

const fakeTransitions = (options?: { readonly reducedMotion?: boolean }) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const started: Array<Started> = []
      let skipped = 0
      win.ViewTransition = class {
        get types() {
          return new Set()
        }
      }
      doc.startViewTransition = (update: (() => void) | Started) => {
        started.push(typeof update === "function" ? { update } : update)
        const done = Promise.resolve()
        return {
          ready: done,
          finished: done,
          updateCallbackDone: done,
          skipTransition: () => skipped++
        }
      }
      if (options?.reducedMotion === true) {
        window.matchMedia = (query) => ({
          ...matchMedia.call(window, query),
          matches: true
        })
      }
      return { started, skipped: () => skipped }
    }),
    () =>
      Effect.sync(() => {
        window.matchMedia = matchMedia
        delete doc.startViewTransition
        delete win.ViewTransition
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
  const dom = domHost.doms.get(host)!
  let commits = 0
  domHost.doms.set(host, {
    ...dom,
    make: (container, options) => {
      const made = dom.make(container, options)
      return made && {
        ...made,
        commit: () => {
          commits++
          made.commit?.()
        }
      }
    }
  })
  const context = Context.merge(
    browser,
    yield* Layer.build(BrowserRouter.layer({ routes: GalleryRoute }))
  ).pipe(
    Context.add(MessageLog.MessageLog, log),
    Context.add(Executor.CurrentExecutor, executor)
  )
  const root = yield* Effect.flatMap(
    Router.currentRoute(GalleryRoute),
    (route) => Renderer.mount(Gallery, { route }, app)
  ).pipe(Effect.provideContext(context))
  const click = (name: string) =>
    HtmlLocator.click(HtmlLocator.getByRole(app, "button", { name }))
  const type = (value: string) =>
    HtmlLocator.type(
      HtmlLocator.getByRole(app, "textbox", { name: "Filter" }),
      value
    )
  return {
    log,
    click,
    type,
    commits: () => commits,
    freeze: () => (root as typeof root & runtime.Root).freeze(),
    shown: () => app.querySelector("p")!.textContent,
    card: () => app.querySelector("main > button:last-child")!.textContent
  }
})

const start = mount(Executor.microtask)

const held = Effect.gen(function*() {
  const tasks: Array<() => void> = []
  const app = yield* mount({
    scheduler: undefined,
    schedule: (task) => tasks.push(task)
  })
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
      expect(transitions.started.map((started) => started.types)).toEqual([[
        "layout-change"
      ]])
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
      expect(updates.map((entry) => entry.viewTransition)).toEqual([
        ["layout-change"],
        undefined,
        undefined
      ])
    }).pipe(Effect.scoped))

  it.effect("without the API, or with reduced motion, the update commits at once", () =>
    Effect.gen(function*() {
      for (
        const setup of [
          Effect.void,
          Effect.asVoid(fakeTransitions({ reducedMotion: true }))
        ]
      ) {
        yield* Effect.gen(function*() {
          yield* setup
          const { click, commits, shown } = yield* start
          const before = commits()
          click("List")
          yield* tick
          expect(shown()).toBe("Grid list ")
          expect(commits()).toBe(before + 1)
        }).pipe(Effect.scoped)
      }
    }))

  it.effect("a mid-flush route transition commits once across callback, freeze, and close", () =>
    Effect.gen(function*() {
      const transitions = yield* fakeTransitions()
      for (const consume of ["callback", "freeze", "close"] as const) {
        yield* Effect.gen(function*() {
          const scope = yield* Scope.make()
          const app = yield* Scope.provide(held, scope)
          const before = transitions.started.length
          const skippedBefore = transitions.skipped()
          app.click("Open")
          while (transitions.started.length === before) {
            if (app.tasks.length > 0) app.tasks.shift()!()
            else yield* tick
          }
          const started = transitions.started.at(-1)!
          expect(started.types).toEqual(["to-detail"])
          expect(app.shown()).toBe("Grid grid ")
          const commits = app.commits()
          if (consume === "callback") {
            started.update()
            expect(app.shown()).toBe("Detail grid ")
          } else if (consume === "freeze") {
            app.freeze()
            expect(app.shown()).toBe("Detail grid ")
            started.update()
          } else {
            yield* Scope.close(scope, Exit.void)
            expect(transitions.skipped()).toBe(skippedBefore + 1)
            const logged = app.log.entries().length
            started.update()
            expect(app.log.entries()).toHaveLength(logged)
          }
          app.runTasks()
          expect({ consume, commits: app.commits() }).toEqual({
            consume,
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
        const liked = log.entries().filter((entry) =>
          entry._tag === "Update" && entry.path !== "Gallery[]"
        )
        expect((liked.at(-1) as MessageLog.Update).props).toEqual({
          layout: flushFirst ? "list" : "grid"
        })
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

  it.effect("Renderer.slowPhases times a flush across its hold, without the wait", () =>
    Effect.gen(function*() {
      const transitions = yield* fakeTransitions()
      // Nanoseconds, split across the hold so that adding milliseconds would round.
      let spent = 0n
      const outer = yield* Clock.Clock
      const clock: Clock.Clock = Object.assign(Object.create(outer), {
        monotonicTimeNanosUnsafe: () => outer.monotonicTimeNanosUnsafe() + spent
      })
      const Go = Mount.make(
        "Go",
        { args: {}, beforeCommit: true },
        () => Effect.void
      )
      const Msg = UiSchema.TaggedEnum({ Went: {} })
      const Slow = Html.component({
        name: "Slow",
        model: Schema.Struct({ went: Schema.Boolean }),
        message: Msg
      }).make({
        init: () => {
          spent += 2_100_000n
          return { went: false }
        },
        update: {
          Went: ($) => $.evolve({ went: true }).viewTransition(["went"])
        },
        view: (h, { went }) => {
          if (went) spent += 2_200_000n
          return h.div.onMount(Go().pipe(Mount.map(Msg.Went))).children(
            went ? "went" : ""
          )
        }
      })
      const reports: Array<Renderer.SlowPhase> = []
      const app = yield* Effect.acquireRelease(
        Effect.sync(() =>
          document.body.appendChild(document.createElement("div"))
        ),
        (element) => Effect.sync(() => element.remove())
      )
      yield* Renderer.mount(Slow, {}, app).pipe(
        Effect.provide(Layer.merge(
          BrowserHost.layer(),
          Renderer.slowPhases({
            flush: "4 millis",
            onSlow: (slow) => {
              reports.push(slow)
            }
          })
        )),
        Effect.provideService(Clock.Clock, clock)
      )
      yield* tick
      expect(transitions.started).toHaveLength(1)
      spent += 100_000_000n
      transitions.started[0]!.update()
      expect(app.textContent).toBe("went")
      expect(reports).toEqual([{ phase: "flush", duration: 4.3, budget: 4 }])
    }).pipe(Effect.scoped))
})
