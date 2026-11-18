// @vitest-environment happy-dom
import {
  Command,
  Component,
  Feature,
  Head,
  MessageLog,
  Mount,
  Query,
  type Renderer,
  Router,
  Subscription
} from "@effect/ui"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { assert, expect, it } from "@effect/vitest"
import { Clock, Context, Duration, Effect, Exit, Fiber, Layer, Option, Schema, type Scope, Stream } from "effect"
import { AsyncResult } from "effect/reactivity"
import { TestClock } from "effect/testing"
import { describe, vi } from "vitest"
import { Confirm, ConfirmMessage } from "./fixtures/confirm.ts"
import { Menu, popoverStub } from "./fixtures/popover.ts"
import { App, AppRoute, People } from "./fixtures/routed.ts"

/** A mount that ends with `message`. */
const mountSending = <A>(name: string, message: A) => Mount.make(name, { args: {} }, () => Effect.succeed(message))()

const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))

/** Runs a block that hydrates with `ssr` on its own `TestHost`, which owns the client tree. */
const hosted = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.scoped, Effect.provide(TestHost.layer())) as Effect.Effect<
    A,
    E,
    Exclude<R, TestHost.TestHost | Scope.Scope | Renderer.Renderer>
  >

const routed = Effect.fnUntraced(function*(url: string) {
  const router = Router.memory({ routes: AppRoute, url })
  const route = yield* Router.currentRoute(AppRoute).pipe(Effect.provide(router))
  return { props: { route }, router }
})

const slowPeople = Layer.succeed(People, {
  bio: (id: number) => Effect.as(Effect.sleep("300 millis"), `Bio of person ${id}`)
})

const container = (html: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const element = document.body.appendChild(document.createElement("div"))
      element.innerHTML = html
      return element
    }),
    (element) => Effect.sync(() => element.remove())
  )

describe("HtmlServer", { concurrent: false }, () => {
  it.effect("drops unsafe attribute names on the server, fresh client and hydrated client", () =>
    Effect.gen(function*() {
      const names = [
        "",
        "x onclick",
        "x\tonclick",
        "x\nonclick",
        "x\ronclick",
        "x\fonclick",
        "x\u0000",
        "x\u001f",
        "x'",
        "x\"",
        "x=onclick",
        "x<",
        "x>",
        "x/",
        "a\"><script>alert(2)</script"
      ]
      const Page = Component.define({
        name: "SafeAttributes",
        model: Schema.Boolean,
        message: Schema.Boolean,
        elements: Html
      }).make({
        init: () => false,
        update: (_, message) => message,
        view: (remove, h) => {
          const unsafe = <E extends { attr(name: string, value: string | undefined): E }>(element: E): E =>
            names.reduce((element, name) => element.attr(name, remove ? undefined : "alert(1)"), element)
          return h.div.children(
            unsafe(h.div.attr("data-safe", remove ? "updated" : "a\"<&")).children("hi"),
            unsafe(h.el("x-safe")),
            unsafe(h.el("svg"))
          )
        }
      })
      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      expect(rendered.html).toBe(
        "<!--[/SafeAttributes--><div><div data-safe=\"a&quot;&lt;&amp;\">hi</div><x-safe></x-safe><svg></svg></div><!--]/SafeAttributes-->"
      )
      for (const hydrate of [false, true]) {
        const app = yield* container(hydrate ? rendered.html : "")
        const before = app.firstElementChild
        const root = yield* BrowserHost.mountEffect(Page, {}, app, hydrate ? { state: rendered.state } : undefined)
        if (hydrate) expect(app.firstElementChild).toBe(before)
        const elements = app.firstElementChild!.children
        const attributeNames = () => Array.from(elements, (element) => element.getAttributeNames())
        expect(attributeNames()).toEqual([["data-safe"], [], []])
        expect(elements[0]!.getAttribute("data-safe")).toBe("a\"<&")
        expect(app.querySelector("script")).toBeNull()
        root.send(true)
        yield* tick
        expect(attributeNames()).toEqual([["data-safe"], [], []])
        expect(elements[0]!.getAttribute("data-safe")).toBe("updated")
      }
    }).pipe(Effect.scoped))

  it.effect("delivers reports on the server before the HTML is written, and hydration adopts it", () =>
    Effect.gen(function*() {
      const GroupMessage = Schema.TaggedUnion({ ChangedOn: { on: Schema.Boolean } })
      const Group = Component.define({
        name: "Group",
        model: Schema.Boolean,
        message: GroupMessage,
        shares: {
          value: (on) => on,
          reports: Schema.Boolean,
          onReports: (reports) => GroupMessage.make({ _tag: "ChangedOn", on: reports.includes(true) })
        }
      }).make({ init: () => false, update: (_, { on }) => on, parts: () => ({}) })
      const Item = Component.define({
        name: "Item",
        props: Schema.Struct({ open: Schema.Boolean }),
        model: Schema.Null,
        message: Schema.Never,
        shared: { group: { owner: Group, report: (_, props) => props.open } },
        elements: Html
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.span.children(h.shared.group ? "group open" : "group closed")
      })
      const Page = Component.define({ name: "Page", model: Schema.Null, message: Schema.Never, elements: Html })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => Group(h, { key: "g", view: () => Item(h, { key: "i", props: { open: true } }) })
        })
      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      expect(rendered.html).toContain("<span>group open</span>")
      const app = yield* container(rendered.html)
      const span = app.querySelector("span")
      yield* BrowserHost.mountEffect(Page, {}, app, { state: rendered.state })
      yield* tick
      expect(app.querySelector("span")).toBe(span)
      expect(span!.textContent).toBe("group open")
    }).pipe(Effect.scoped))

  it.effect("folds HTML attribute names with last-write wins, but preserves SVG casing", () =>
    Effect.gen(function*() {
      const Page = Component.define({
        name: "AttributeCase",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) =>
          h.div.attr("TYPE", "first").attr("type", "last").children(
            h.el("x-safe").attr("DATA-X", "first").attr("data-x", "last"),
            h.select.value("chosen").children(h.option.attr("VALUE", "chosen").children("label")),
            h.el("svg").attr("viewBox", "0 0 10 10").children(
              h.el("linearGradient").attr("gradientUnits", "userSpaceOnUse")
            )
          )
      })
      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      expect(rendered.html).toBe(
        "<!--[/AttributeCase--><div type=\"last\"><x-safe data-x=\"last\"></x-safe>" +
          "<select><option value=\"chosen\" selected>label</option></select>" +
          "<svg viewBox=\"0 0 10 10\"><linearGradient gradientUnits=\"userSpaceOnUse\"></linearGradient></svg></div><!--]/AttributeCase-->"
      )
      for (const hydrate of [false, true]) {
        const app = yield* container(hydrate ? rendered.html : "")
        const before = app.firstElementChild
        yield* BrowserHost.mountEffect(Page, {}, app, hydrate ? { state: rendered.state } : undefined)
        if (hydrate) expect(app.firstElementChild).toBe(before)
        const div = app.firstElementChild!
        expect(div.getAttributeNames()).toEqual(["type"])
        expect(div.getAttribute("type")).toBe("last")
        expect(div.querySelector("x-safe")!.getAttribute("data-x")).toBe("last")
        expect(div.querySelector("select")!.value).toBe("chosen")
        expect(div.querySelector("option")!.selected).toBe(true)
        expect(div.querySelector("svg")!.getAttributeNames()).toEqual(["viewBox"])
        expect(div.querySelector("linearGradient")!.getAttributeNames()).toEqual(["gradientUnits"])
      }
    }).pipe(Effect.scoped))

  it.effect("keeps winning HTML aliases through updates and removals without folding SVG attributes", () =>
    Effect.gen(function*() {
      // What each step sets, and what the elements then hold. The HTML parser folds
      // SVG names, so both case-sensitive SVG attributes are checked after an update.
      const steps = [
        { loser: "0", winner: "winner", html: "winner", svg: "0" }, // As mounted.
        { loser: "1", winner: "winner", html: "winner", svg: "1" }, // Change the losing alias.
        { loser: undefined, winner: "winner", html: "winner", svg: null }, // Remove the losing alias.
        { loser: "1", winner: "winner", html: "winner", svg: "1" }, // Restore it without changing the winner.
        { loser: "1", winner: undefined, html: "1", svg: "1" }, // Remove the winner, revealing the losing alias.
        { loser: undefined, winner: undefined, html: null, svg: null } // Remove the final alias.
      ] as const
      const Page = Component.define({
        name: "AttributeUpdates",
        model: Schema.Number,
        message: Schema.Number,
        elements: Html
      }).make({
        init: () => 0,
        update: (_, message) => message,
        view: (step, h) => {
          const { loser, winner } = steps[step]!
          return h.div.children(
            h.div.attr("DATA-X", loser).attr("data-x", winner),
            h.el("x-safe").attr("DATA-X", loser).attr("data-x", winner),
            h.el("svg").attr("viewBox", "0 0 10 10").attr("viewbox", loser)
          )
        }
      })
      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      for (const hydrate of [false, true]) {
        const app = yield* container(hydrate ? rendered.html : "")
        const before = app.firstElementChild
        const root = yield* BrowserHost.mountEffect(Page, {}, app, hydrate ? { state: rendered.state } : undefined)
        if (hydrate) expect(app.firstElementChild).toBe(before)
        for (let step = 1; step < steps.length; step++) {
          root.send(step)
          yield* tick
          const { html, svg } = steps[step]!
          const children = app.firstElementChild!.children
          expect(children[0]!.getAttribute("data-x")).toBe(html)
          expect(children[1]!.getAttribute("data-x")).toBe(html)
          expect(children[2]!.getAttribute("viewBox")).toBe("0 0 10 10")
          expect(children[2]!.getAttribute("viewbox")).toBe(svg)
        }
      }
    }).pipe(Effect.scoped))

  it.effect("samples root subscriptions once on the server without building Streams, and surfaces throws", () =>
    Effect.gen(function*() {
      let sampled = 0
      let built = 0
      const Root = Component.define({
        name: "LazyRoot",
        model: Schema.Number,
        message: Schema.Never
      }).make({
        init: () => 0,
        update: (model) => model,
        subscriptions: () => {
          sampled++
          return [Subscription.make("browser", null, (): Stream.Stream<never> => {
            built++
            throw new Error("browser-only builder")
          })]
        },
        view: (_, h) => h.text("root")
      })
      const result = yield* HtmlServer.renderToHtml(Root, {})
      assert.include(result.html, "root")
      assert.strictEqual(sampled, 1)
      assert.strictEqual(built, 0)
      const Broken = Component.define({
        name: "BrokenRoot",
        model: Schema.Number,
        message: Schema.Never
      }).make({
        init: () => 0,
        update: (model) => model,
        subscriptions: () => {
          throw new Error("subscription declaration failed")
        },
        view: (_, h) => h.text("unreachable")
      })
      const error = yield* Effect.exit(HtmlServer.renderToHtml(Broken, {}))
      assert.isTrue(Exit.isFailure(error))
    }))

  it.effect("checks only the first Router subscription on the server", () => {
    const problems: Array<Query.Problem.Any> = []
    const Root = Component.define({
      name: "FirstRoute",
      model: Schema.Number,
      message: Schema.Never
    }).make({
      init: () => 0,
      update: (model) => model,
      subscriptions: () => [
        Router.subscription(AppRoute, AppRoute.make({ _tag: "Home" }), () => {
          throw new Error("Stream ran")
        }),
        Router.subscription(AppRoute, AppRoute.make({ _tag: "Slow" }), () => {
          throw new Error("Stream ran")
        })
      ],
      view: (_, h) => h.text("root")
    })
    return Effect.gen(function*() {
      yield* HtmlServer.renderToHtml(Root, {})
      assert.deepStrictEqual(problems, [])
    }).pipe(
      Effect.provide(Router.static({ routes: AppRoute, url: "/" })),
      Effect.provideService(Query.Problems, (problem) => problems.push(problem))
    )
  })

  it.effect("reports a server route mismatch even after navigation, but accepts a fresh snapshot", () => {
    const problems: Array<Query.Problem.Any> = []
    return Effect.gen(function*() {
      const router = yield* Router.Router
      const route = yield* Router.currentRoute(AppRoute)
      yield* router.navigate("/")
      const stale = yield* HtmlServer.renderToHtml(App, { route })
      assert.include(stale.html, "Person 1")
      assert.strictEqual(problems.length, 1)
      assert.strictEqual(problems[0]._tag, "RouteMismatch")
      problems.length = 0
      yield* HtmlServer.renderToHtml(App, { route: yield* Router.currentRoute(AppRoute) })
      assert.deepStrictEqual(problems, [])
    }).pipe(
      Effect.provide([People.layer, Router.memory({ routes: AppRoute, url: "/people/1" })]),
      Effect.provideService(Query.Problems, (problem) => problems.push(problem))
    )
  })

  it.effect("renders the routed example with its route data, and hydration adopts it", () =>
    Effect.gen(function*() {
      const router = Router.memory({ routes: AppRoute, url: "/people/1" })
      const rendered = yield* HtmlServer.renderToHtml(App, Router.props(AppRoute)).pipe(
        Effect.provide([People.layer, router])
      )
      expect(rendered.html).toContain("<p id=\"bio\">Bio of person 1</p>")
      expect(rendered.html).toContain("<!--[/App/Person[/people/1]-->")
      expect(rendered.state["~query"]).toEqual({ GetBio: [["{\"id\":1}", 0, "Bio of person 1", 0]] })
      expect("~pending" in rendered.state).toBe(false)
      expect(rendered.head).toBe(
        "<title data-eui>Person 1 · App</title>" +
          "<meta name=\"description\" content=\"About person 1\" data-eui>" +
          "<script type=\"application/ld+json\" data-eui>{\"@type\":\"Person\",\"identifier\":1}</script>"
      )
      expect(rendered.htmlAttributes).toBe("lang=\"en\" class=\"routed\" data-eui=\"lang class\"")

      yield* hosted(Effect.gen(function*() {
        const result = yield* ssr(App, Router.props(AppRoute)).pipe(Effect.provide([People.layer, router]))
        expect(result.adopted).toEqual(["/App", "/App/Person[/people/1]"])
        expect(result.misses).toEqual([])
        // The bio is hydrated, so the client doesn't fetch it. The hydrated result is on Mounted, and the
        // watch's first value equals it, so it isn't written again.
        expect(result.root.fetches()).toEqual([])
        expect(result.log.filter((entry) => entry._tag === "QueryChanged")).toEqual([])
        expect(result.log.some((entry) => entry._tag === "Update" && entry.path === "/App/Person[/people/1]")).toBe(
          false
        )
        expect(result.document.title).toBe("Person 1 · App")
      }))
    }).pipe(Effect.scoped))

  it.effect("renders a modal dialog closed, with no open attribute, and hydration shows it", () =>
    Effect.gen(function*() {
      const props = { state: "modal", acceptEscape: false } as const
      const modal = yield* HtmlServer.renderToHtml(Confirm, props)
      expect(modal.html).toContain("<dialog aria-label=\"Delete note?\">")
      const open = yield* HtmlServer.renderToHtml(Confirm, { ...props, state: "open" })
      expect(open.html).toContain("<dialog aria-label=\"Delete note?\" open>")

      const showModal = vi.spyOn(window.HTMLDialogElement.prototype, "showModal")
      yield* Effect.addFinalizer(() => Effect.sync(() => showModal.mockRestore()))
      const app = yield* container(modal.html)
      const dialog = app.querySelector("dialog")!
      yield* BrowserHost.mountEffect(Confirm, props, app, { state: modal.state })
      yield* tick
      // The server's dialog is adopted and shown as a modal once it's live.
      expect(app.querySelector("dialog")).toBe(dialog)
      expect(showModal.mock.contexts).toEqual([dialog])
      expect(dialog.open).toBe(true)
    }).pipe(Effect.scoped))

  it.effect("a hydrated open dialog's close belongs to that showing, not to a modal shown since", () =>
    Effect.gen(function*() {
      const props = { state: "open", acceptEscape: false } as const
      const rendered = yield* HtmlServer.renderToHtml(Confirm, props)
      const app = yield* container(rendered.html)
      const dialog = app.querySelector("dialog")!
      const root = yield* BrowserHost.mountEffect(Confirm, props, app, { state: rendered.state })
      expect(app.querySelector("dialog")).toBe(dialog)
      // Browsers report a close a task later; happy-dom reports it at once.
      const pending: Array<() => void> = []
      const close = vi.spyOn(dialog, "close").mockImplementation(() => {
        dialog.open = false
        pending.push(() => dialog.dispatchEvent(new Event("close")))
      })
      yield* Effect.addFinalizer(() => Effect.sync(() => close.mockRestore()))
      // The browser closes the adopted showing, and the Model shows a modal before the report.
      dialog.close()
      root.send(ConfirmMessage.make({ _tag: "Mode", state: "modal" }))
      yield* Effect.promise(() => Promise.resolve())
      expect(dialog.open).toBe(true)
      pending.shift()!()
      expect(root.model()!.log).toEqual([])
      // The modal's own close still reaches the app.
      dialog.close()
      pending.shift()!()
      expect(root.model()!.log).toEqual(["closed"])
    }).pipe(Effect.scoped))

  it.effect("renders a popover closed with its mode, and hydration shows it", () =>
    Effect.gen(function*() {
      const props = { mode: "manual", open: true, follow: false } as const
      const rendered = yield* HtmlServer.renderToHtml(Menu, props)
      expect(rendered.html).toContain("<div aria-label=\"Menu\" role=\"menu\" popover=\"manual\">")
      const stub = yield* popoverStub
      const app = yield* container(rendered.html)
      const menu = app.querySelector("[aria-label=Menu]")!
      yield* BrowserHost.mountEffect(Menu, props, app, { state: rendered.state })
      yield* tick
      expect(app.querySelector("[aria-label=Menu]")).toBe(menu)
      expect(stub.calls).toEqual(["showPopover Menu"])
    }).pipe(Effect.scoped))

  it.effect("hydrates what missed the budget: a fetch in flight and a deferred Layer", () =>
    hosted(Effect.gen(function*() {
      const person = yield* routed("/people/2")
      const missed = yield* ssr(App, person.props, {
        budget: "50 millis",
        frames: (container) => container.querySelector("#bio")?.textContent ?? ""
      }).pipe(
        Effect.provide([slowPeople, person.router])
      )
      expect(missed.html).toContain("<p id=\"bio\">Loading</p>")
      // The fetch in flight at the budget was interrupted and isn't shipped: the client fetches it.
      expect(missed.misses).toEqual([{ query: "GetBio", logKey: "{\"id\":2}" }])
      expect(missed.state["~query"]).toEqual({})
      expect(missed.root.fetches().map((fetch) => [fetch.query, fetch.trigger, fetch.inWindow])).toEqual([
        ["GetBio", "watch", false]
      ])
      yield* TestClock.adjust("300 millis")
      yield* TestHost.settle
      expect(missed.container.querySelector("#bio")!.textContent).toBe("Bio of person 2")
      // From the server's markup through hydration to the fetch the client made.
      expect(missed.root.frames()).toEqual(["Loading", "Bio of person 2"])

      const slow = yield* routed("/slow")
      const deferred = yield* ssr(App, slow.props, { budget: "50 millis" }).pipe(
        Effect.provide([People.layer, slow.router])
      )
      expect(deferred.state["~deferred"]).toEqual(["/App/Slow[/slow]"])
      expect(deferred.state["/App/Slow[/slow]"]).toBeUndefined()
      yield* TestClock.adjust("1 second")
      yield* TestHost.settle
      expect(deferred.container.querySelector("h1")!.textContent).toBe("Slow")
    })))

  it.effect("starts no fetch with a budget of 0, and the client fetches what missed it", () =>
    hosted(Effect.gen(function*() {
      const { props, router } = yield* routed("/people/1")
      const result = yield* ssr(App, props, { budget: 0 }).pipe(Effect.provide([People.layer, router]))
      expect(result.html).toContain("<p id=\"bio\">Loading</p>")
      expect(result.serverLog.filter((entry) => entry._tag === "FetchStarted")).toEqual([])
      expect(result.misses).toEqual([{ query: "GetBio", logKey: "{\"id\":1}" }])
      yield* TestHost.settle
      expect(result.container.querySelector("#bio")!.textContent).toBe("Bio of person 1")
    })))

  it.effect("runs no Command on the server, applies events, and defers failures and opted-out Layers", () =>
    Effect.gen(function*() {
      class GetText extends Query.Service<GetText>()("GetText", {
        args: {},
        success: Schema.String,
        error: Schema.Never,
        staleTime: "30 seconds"
      }, Effect.succeed(() => Effect.succeed("loaded"))) {}
      const ChildMessage = Schema.TaggedUnion({ Loaded: {}, Tracked: {} })
      const Track = Command.make("Track", { args: {} }, () => Effect.succeed(ChildMessage.make({ _tag: "Tracked" })))
      let builds = 0
      const Child = Component.define({
        name: "Child",
        model: Schema.Struct({ status: Schema.String }),
        message: ChildMessage,
        events: Schema.Literal("loaded"),
        elements: Html,
        queries: {
          text: { query: GetText, args: () => ({}), onChange: () => ChildMessage.make({ _tag: "Loaded" }) }
        }
      }).make({
        // init's Command is dropped silently: the client runs it when it adopts.
        init: ($) => $.set({ status: "loading" }).run(Track()),
        update: (model, message, $) =>
          message._tag === "Loaded"
            ? $.set({ status: "loaded" }).run(Command.interrupt(Track)).run(Track()).emit(
              "loaded"
            )
            : { ...model, status: "tracked" },
        subscriptions: () => [
          // subscriptions() runs on the server, but a Stream's builder doesn't.
          Subscription.make("browser", 0, () => {
            builds++
            return Stream.never
          })
        ],
        view: (model, h) => h.span(model.status)
      }).pipe(Component.provide(GetText.layer))
      const Broken = Component.define({
        name: "Broken",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: () => {
          throw new Error("boom")
        }
      })
      class Connection extends Context.Service<Connection, string>()("test/Connection") {}
      const Live = Component.define({
        name: "Live",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("live")
      }).pipe(Component.provide(Layer.succeed(Connection, "socket"), { server: false }))
      const ParentMessage = Schema.TaggedUnion({ Ready: {} })
      const Parent = Component.define({
        name: "Parent",
        model: Schema.Boolean,
        message: ParentMessage,
        elements: Html
      }).make({
        init: () => false,
        update: () => true,
        view: (ready, h) =>
          h.div(
            h.p(ready ? "ready" : "waiting"),
            Child(
              h,
              { key: "a", props: {}, onEmit: () => ParentMessage.make({ _tag: "Ready" }) }
            ),
            Broken(h, { key: "b", props: {}, fallback: () => h.p("broken") }),
            Live(h, { key: "c", props: {} })
          )
      })

      // The opted-out Layer doesn't spend the budget: under the TestClock, waiting for it would never end.
      const log = MessageLog.makeMemory({ size: 1000 })
      const problems: Array<Query.Problem.Any> = []
      const result = yield* HtmlServer.renderToHtml(Parent, {}, { budget: "1 hour" }).pipe(
        Effect.provideService(MessageLog.MessageLog, log),
        Effect.provideService(Query.Problems, (problem) => problems.push(problem))
      )
      expect(result.html).toContain("<p>ready</p>")
      expect(result.html).toContain("<span>loaded</span>")
      expect(result.html).toContain("<!--[/Parent/Broken[b]--><p>broken</p><!--]/Parent/Broken[b]-->")
      expect(result.state["~deferred"]).toEqual(["/Parent/Broken[b]", "/Parent/Live[c]"])
      expect(builds).toBe(0)
      // Only update's Commands are logged and reported, its interrupt included. init's was dropped silently.
      const dropped = log.entries().filter((entry) => entry._tag === "CommandDropped")
      expect(dropped).toEqual([
        expect.objectContaining({ path: "/Parent/Child[a]", name: "Track", reason: "server" }),
        expect.objectContaining({ path: "/Parent/Child[a]", name: "Track", reason: "server" })
      ])
      expect(problems).toEqual([
        expect.objectContaining({ _tag: "ServerCommandIssued", path: "/Parent/Child[a]", command: "Track" }),
        expect.objectContaining({ _tag: "ServerCommandIssued", path: "/Parent/Child[a]", command: "Track" })
      ])
    }))

  it.effect("reports ServerCommandIssued every time, and fails ssr with it", () =>
    Effect.gen(function*() {
      const Message = Schema.TaggedUnion({ Go: {} })
      const Log = Command.make("Log", { args: {} }, () => Effect.never)
      const Page = Component.define({
        name: "Page",
        model: Schema.Number,
        message: Message,
        elements: Html
      }).make({
        init: ($) => $.set(0).run(Log()),
        update: (count, _, $) => $.set(count + 1).run(Log()),
        view: (count, h) => h.p.onMount(mountSending("Go", Message.make({ _tag: "Go" }))).children(String(count))
      })
      // An event from a child drives the parent's update twice on the server.
      const Child = Component.define({
        name: "Child",
        model: Schema.Struct({}),
        message: Schema.Never,
        events: Schema.Literal("twice"),
        elements: Html
      }).make({
        init: ($) => $.set({}).emit("twice").emit("twice"),
        update: (model) => model,
        view: (_, h) => h.span("child")
      })
      const Parent = Component.define({
        name: "Parent",
        model: Schema.Number,
        message: Message,
        elements: Html
      }).make({
        init: () => 0,
        update: (count, _, $) => $.set(count + 1).run(Log()),
        view: (count, h) =>
          h.div(h.p(String(count)), Child(h, { key: "c", props: {}, onEmit: () => Message.make({ _tag: "Go" }) }))
      })
      const problems: Array<Query.Problem.Any> = []
      const rendered = yield* HtmlServer.renderToHtml(Parent, {}).pipe(
        Effect.provideService(Query.Problems, (problem) => problems.push(problem))
      )
      expect(rendered.html).toContain("<p>2</p>")
      expect(problems.map((problem) => problem._tag)).toEqual(["ServerCommandIssued", "ServerCommandIssued"])

      yield* hosted(Effect.gen(function*() {
        const error = yield* Effect.flip(ssr(Parent, {}))
        expect(error.problems.filter((problem) => problem.startsWith("ServerCommandIssued:"))).toHaveLength(2)
        yield* TestHost.expectProblem("ServerCommandIssued")
      }))
      // init's Command on its own is no problem.
      yield* hosted(Effect.gen(function*() {
        const result = yield* ssr(Page, {})
        expect(result.commands).toEqual([{ path: "/Page", name: "Log", index: 0 }])
      }))
    }))

  it.effect("keeps an instance whose Layer is still building inert until it adopts, then fires onMount", () =>
    Effect.gen(function*() {
      class Store extends Context.Service<Store, string>()("test/Store") {}
      const Message = Schema.TaggedUnion({ Mounted: {}, Clicked: {} })
      const Panel = Component.define({
        name: "Panel",
        model: Schema.Struct({ mounted: Schema.Boolean, clicks: Schema.Number }),
        message: Message,
        elements: Html
      }).make({
        init: () => ({ mounted: false, clicks: 0 }),
        update: (model, message) =>
          message._tag === "Mounted" ? { ...model, mounted: true } : { ...model, clicks: model.clicks + 1 },
        view: (model, h) =>
          h.button
            .onClick(Message.make({ _tag: "Clicked" }))
            .onMount(mountSending("Mounted", Message.make({ _tag: "Mounted" }))).children(
              `${model.clicks} ${model.mounted ? "mounted" : "server"}`
            )
      }).pipe(Component.provide(Layer.effect(Store, Effect.as(Effect.sleep("50 millis"), "ready"))))

      const fiber = yield* Effect.forkChild(HtmlServer.renderToHtml(Panel, {}))
      yield* TestClock.adjust("50 millis")
      const rendered = yield* Fiber.join(fiber)
      expect(rendered.state["~deferred"]).toEqual([])
      const app = yield* container(rendered.html)
      const button = app.querySelector("button")!
      const log = MessageLog.makeMemory({ size: 1000 })
      const root = yield* BrowserHost.mountEffect(Panel, {}, app, { state: rendered.state }).pipe(
        Effect.provideService(MessageLog.MessageLog, log)
      )
      button.click()
      yield* tick
      expect(button.textContent).toBe("0 server")
      // The log says what is on screen while it waits: the server's Model, and no Model of its own.
      expect(log.entries().map((entry) => entry._tag)).toEqual(["SessionStarted", "Waiting", "LayerPending"])
      expect((log.entries()[1] as MessageLog.Waiting).model).toEqual({ mounted: false, clicks: 0 })

      yield* TestClock.adjust("50 millis")
      yield* root.adopted
      yield* tick
      expect(log.entries().slice(3, 5).map((entry) => entry._tag)).toEqual(["LayerReady", "Mounted"])
      expect(app.querySelector("button")).toBe(button)
      expect(button.textContent).toBe("0 mounted")
      button.click()
      yield* tick
      expect(button.textContent).toBe("1 mounted")
      expect(app.innerHTML).not.toContain("<!--")
    }).pipe(Effect.scoped))

  it.effect("a keyed provide selects its Layer from the Model the client adopts", () =>
    Effect.gen(function*() {
      class Store extends Context.Service<Store, string>()("test/KeyedStore") {}
      class ReadStore extends Command.Service<ReadStore>()(
        "test/ReadKeyedStore",
        { args: {}, invalidates: () => [] },
        Store.useSync((store) => () => Effect.succeed(store))
      ) {}
      // What `init` returns where it runs: the client's is dropped for the Model the server rendered.
      let side = "server"
      const Panel = Component.provide(
        Component.define({
          name: "Panel",
          model: Schema.Struct({ side: Schema.String, store: Schema.String }),
          message: Schema.String,
          elements: Html
        }).make({
          init: ($) => $.set({ side, store: "" }).run(ReadStore.make()),
          update: (model, store) => ({ ...model, store }),
          view: (model, h) => h.p(`${model.side}:${model.store}`)
        }),
        {
          key: (_, model) => model.side,
          layer: (side) => ReadStore.layer.pipe(Layer.provide(Layer.succeed(Store, side)))
        }
      )
      const rendered = yield* HtmlServer.renderToHtml(Panel, {})
      expect(rendered.html).toContain("<p>server:</p>")
      side = "client"
      const app = yield* container(rendered.html)
      const root = yield* BrowserHost.mountEffect(Panel, {}, app, { state: rendered.state })
      yield* root.adopted
      yield* tick
      expect(app.querySelector("p")!.textContent).toBe("server:server")
    }).pipe(Effect.scoped))

  it.effect("rebuilds only the instance whose nodes don't match", () =>
    Effect.gen(function*() {
      const Item = Component.define({
        name: "Item",
        props: Schema.Struct({ label: Schema.String }),
        model: Schema.String,
        message: Schema.Never,
        elements: Html
      }).make({
        init: ($) => $.props.label,
        update: (model) => model,
        view: (label, h) => h.li(label)
      })
      const List = Component.define({
        name: "List",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) =>
          h.ul(
            Item(h, { key: "a", props: { label: "A" } }),
            Item(h, { key: "b", props: { label: "B" } })
          )
      })
      const rendered = yield* HtmlServer.renderToHtml(List, {})
      const app = yield* container(rendered.html.replace("<li>A</li>", "<li>changed</li>"))
      const [first, second] = app.querySelectorAll("li")
      yield* BrowserHost.mountEffect(List, {}, app, { state: rendered.state })
      const [a, b] = app.querySelectorAll("li")
      expect(a.textContent).toBe("A")
      expect(a).not.toBe(first)
      expect(b).toBe(second)
      expect(app.querySelector("ul")!.childNodes.length).toBe(2)
    }).pipe(Effect.scoped))
  it.effect("fails the parent whose view has two children at one path when it adopts", () =>
    Effect.gen(function*() {
      // The server renders two keys; the client's view at adoption renders one of them twice.
      let client = false
      const Item = Component.define({
        name: "Item",
        props: Schema.Struct({ label: Schema.String }),
        model: Schema.String,
        message: Schema.Never,
        elements: Html
      }).make({
        init: ($) => $.props.label,
        update: (model) => model,
        view: (label, h) => h.li(label)
      })
      const List = Component.define({
        name: "List",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) =>
          h.ul(
            Item(h, { key: "a", props: { label: "A" } }),
            Item(h, { key: client ? "a" : "b", props: { label: "B" } })
          )
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.main(List(h, { key: "l", props: {}, fallback: () => h.p("failed") }))
      })
      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      expect(rendered.html).toContain("<li>B</li>")
      client = true
      const app = yield* container(rendered.html)
      const log = MessageLog.makeMemory({ size: 1000 })
      yield* BrowserHost.mountEffect(Page, {}, app, { state: rendered.state }).pipe(
        Effect.provideService(MessageLog.MessageLog, log)
      )
      expect(app.querySelector("main")!.innerHTML).toBe("<p>failed</p>")
      const failed = log.entries().filter((entry) => entry._tag === "Failed")
      expect(failed).toEqual([expect.objectContaining({ path: "/Page/List[l]", in: "view" })])
      expect(log.entries().filter((entry) => entry._tag === "Mounted").map((entry) => entry.path)).toEqual([
        "/Page",
        "/Page/List[l]"
      ])
    }).pipe(Effect.scoped))
  it.effect("waits for the instance a Layer that settles in budget wakes, and for the fetches it starts", () =>
    Effect.gen(function*() {
      class GetText extends Query.Service<GetText>()("GetText", {
        args: {},
        success: Schema.String,
        error: Schema.Never,
        staleTime: "30 seconds"
      }, Effect.succeed(() => Effect.as(Effect.sleep("10 millis"), "data"))) {}
      class Panel extends Feature.Service<Panel>()("Panel", { props: Schema.Struct({}), events: Schema.Never }) {}
      const PanelLive = Component.define({
        name: "PanelLive",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html,
        queries: { text: { query: GetText, args: () => ({}) } }
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p(AsyncResult.isSuccess(h.queries.text) ? h.queries.text.value : "loading")
      }).pipe(Component.provide(GetText.layer))
      const Page = Component.define({
        name: "Page",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) =>
          h.div(
            Panel.render(h, { key: "p", props: {}, fallback: () => h.p("fallback") })
          )
      }).pipe(Component.provide(Layer.merge(Panel.toLayer(PanelLive), Layer.effectDiscard(Effect.sleep("20 millis")))))

      const fiber = yield* Effect.forkChild(HtmlServer.renderToHtml(Page, {}))
      yield* TestClock.adjust("20 millis")
      yield* TestClock.adjust("10 millis")
      const rendered = yield* Fiber.join(fiber)
      expect(rendered.html).toContain("<p>data</p>")
      expect(rendered.state["~deferred"]).toEqual([])
      expect(rendered.state["~query"]).toEqual({ GetText: [["{}", 0, "data", 30]] })
    }))

  it.effect("fails and defers the instance whose fetcher dies, and ships no entry for it", () =>
    Effect.gen(function*() {
      class Die extends Query.Service<Die>()("Die", {
        args: {},
        success: Schema.String,
        error: Schema.Never,
        staleTime: "30 seconds"
      }, Effect.succeed(() => Effect.die("boom"))) {}
      const Doomed = Component.define({
        name: "Doomed",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html,
        queries: { text: { query: Die, args: () => ({}) } }
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("loading")
      }).pipe(Component.provide(Die.layer))
      const Page = Component.define({
        name: "Page",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) =>
          h.div(
            Doomed(h, { key: "d", props: {}, fallback: () => h.p("failed") })
          )
      })

      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      expect(rendered.html).toContain("<!--[/Page/Doomed[d]--><p>failed</p><!--]/Page/Doomed[d]-->")
      expect(rendered.state["~deferred"]).toEqual(["/Page/Doomed[d]"])
      expect(rendered.state["~query"]).toEqual({})
    }))

  it.effect("closes everything it started when the render is interrupted", () =>
    Effect.gen(function*() {
      let acquired = 0
      let released = 0
      const Held = Layer.effectDiscard(
        Effect.acquireRelease(Effect.sync(() => acquired++), () => Effect.sync(() => released++)).pipe(
          Effect.andThen(Effect.sleep("100 millis"))
        )
      )
      const Page = Component.define({
        name: "Page",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("page")
      }).pipe(Component.provide(Held))
      const fiber = yield* Effect.forkChild(HtmlServer.renderToHtml(Page, {}))
      yield* TestClock.adjust("20 millis")
      expect([acquired, released]).toEqual([1, 0])
      yield* Fiber.interrupt(fiber)
      yield* TestClock.adjust("150 millis")
      expect([acquired, released]).toEqual([1, 1])
    }))

  it.effect("writes only text inside a textarea, and hydration rebuilds just that text", () =>
    hosted(Effect.gen(function*() {
      const Word = Component.define({
        name: "Word",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.text("hello")
      })
      const Form = Component.define({
        name: "Form",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.div(h.textarea(Word(h, { key: "a", props: {} })), h.p("after"))
      })
      const result = yield* ssr(Form, {})
      expect(result.html).toBe(
        "<!--[/Form--><div><textarea>hello</textarea><p>after</p></div><!--]/Form-->"
      )
      expect(result.adopted).toEqual(["/Form", "/Form/Word[a]"])
      expect(result.container.querySelector("textarea")!.value).toBe("hello")
    })))

  it.effect("judges adoption when it commits, before onMount updates replace nodes", () =>
    hosted(Effect.gen(function*() {
      const Message = Schema.TaggedUnion({ Mounted: {} })
      const Swap = Component.define({
        name: "Swap",
        model: Schema.Boolean,
        message: Message,
        elements: Html
      }).make({
        init: () => false,
        update: () => true,
        view: (mounted, h) =>
          mounted
            ? h.div("mounted")
            : h.p.onMount(mountSending("Swap", Message.make({ _tag: "Mounted" }))).children("server")
      })
      const result = yield* ssr(Swap, {})
      yield* TestHost.settle
      expect(result.container.textContent).toBe("mounted")
    })))
  it.effect("keeps marker paths through the parser's normalisation of CR, NUL and lone surrogates", () =>
    Effect.gen(function*() {
      const Leaf = Component.define({
        name: "Leaf",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("leaf")
      })
      const Root = Component.define({
        name: "Root",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => Leaf(h, { key: "a\rb\r\nc\u0000d\ud800e-->", props: {} })
      })
      const rendered = yield* HtmlServer.renderToHtml(Root, {})
      // What a browser does before it parses: UTF-8 replaces a lone surrogate, the input stream turns CR
      // and CRLF into LF, and a comment turns NUL into U+FFFD. Happy DOM does none of it.
      const parsed = new TextDecoder().decode(new TextEncoder().encode(rendered.html))
        .replace(/\r\n?/g, "\n")
        .replaceAll("\u0000", "\ufffd")
      expect(parsed).toBe(rendered.html)
      const app = yield* container(parsed)
      const leaf = app.querySelector("p")
      yield* BrowserHost.mountEffect(Root, {}, app, { state: rendered.state })
      expect(app.querySelector("p")).toBe(leaf)
      expect(app.innerHTML).toBe("<p>leaf</p>")
    }).pipe(Effect.scoped))

  it.effect("compares the head at adoption, so a mount update while an instance waits isn't a mismatch", () =>
    hosted(Effect.gen(function*() {
      class Slow extends Context.Service<Slow, string>()("test/Slow") {}
      const Waiting = Component.define({
        name: "Waiting",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("waiting")
      }).pipe(Component.provide(Layer.effect(Slow, Effect.as(Effect.sleep("30 millis"), "ready"))))
      const Message = Schema.TaggedUnion({ Mounted: {} })
      const Titled = Component.define({
        name: "Titled",
        model: Schema.String,
        message: Message,
        elements: Html
      }).make({
        init: () => "server",
        update: () => "mounted",
        head: (title) => [Head.title(title)],
        view: (_, h) =>
          h.div.onMount(mountSending("Title", Message.make({ _tag: "Mounted" }))).children(
            Waiting(h, { key: "w", props: {} })
          )
      })
      const result = yield* ssr(Titled, {})
      expect(result.adopted).toEqual(["/Titled", "/Titled/Waiting[w]"])
      yield* TestHost.settle
      expect(result.document.title).toBe("mounted")
    })))
  it.effect("compares the head the client evaluated, over the instance tree, not one rebuilt from paths", () =>
    hosted(Effect.gen(function*() {
      // Alternates per evaluation, so evaluating it again after adoption would agree with the server.
      let runs = 0
      const Unstable = Component.define({
        name: "Unstable",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        head: () => [Head.title(runs++ % 2 === 0 ? "server" : "client")],
        view: (_, h) => h.p("same")
      })
      const unstable = yield* Effect.flip(ssr(Unstable, {}))
      expect(unstable.problems).toEqual(["head title: the server has \"server\", the client \"client\""])
      expect(runs).toBe(2)

      // Siblings whose keys make one path look like the other's descendant: no template applies.
      const Box = Component.define({
        name: "Box",
        props: Schema.Struct({ title: Schema.String }),
        model: Schema.String,
        message: Schema.Never,
        elements: Html
      }).make({
        init: ($) => $.props.title,
        update: (model) => model,
        head: (title) => [Head.title(title), Head.titleTemplate((inner) => `wrap(${inner})`)],
        view: (title, h) => h.p(title)
      })
      const Siblings = Component.define({
        name: "Siblings",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) =>
          h.div(
            Box(h, { key: "a", props: { title: "A" } }),
            Box(h, { key: "a]/Box[b", props: { title: "B" } })
          )
      })
      const siblings = yield* ssr(Siblings, {})
      expect(siblings.head.title).toBe("B")

      // A template that really applies, and differs on the client, still fails.
      let templates = 0
      const Outer = Component.define({
        name: "Outer",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        head: () => {
          const side = templates++ % 2 === 0 ? "server" : "client"
          return [Head.titleTemplate((inner) => `${inner} (${side})`)]
        },
        view: (_, h) => h.div(Box(h, { key: "a", props: { title: "Inner" } }))
      })
      const nested = yield* Effect.flip(ssr(Outer, {}))
      expect(nested.problems).toEqual([
        "head title: the server has \"Inner (server)\", the client \"Inner (client)\""
      ])
    })))
  it.effect("snapshots the instances adoption saw, so removing one while an instance waits isn't a mismatch", () =>
    hosted(Effect.gen(function*() {
      class Slow extends Context.Service<Slow, string>()("test/Slow") {}
      const Waiting = Component.define({
        name: "Waiting",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("waiting")
      }).pipe(Component.provide(Layer.effect(Slow, Effect.as(Effect.sleep("30 millis"), "ready"))))
      const Titled = Component.define({
        name: "Titled",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        head: () => [Head.title("title")],
        view: (_, h) => h.p("titled")
      })
      const Message = Schema.TaggedUnion({ Mounted: {} })
      const Page = Component.define({
        name: "Page",
        model: Schema.Boolean,
        message: Message,
        elements: Html
      }).make({
        init: () => true,
        update: () => false,
        view: (showTitled, h) =>
          h.div.onMount(mountSending("Hide", Message.make({ _tag: "Mounted" }))).children(
            showTitled ? Titled(h, { key: "t", props: {} }) : h.p("gone"),
            Waiting(h, { key: "w", props: {} })
          )
      })
      const result = yield* ssr(Page, {})
      expect(result.head.title).toBe("title")
      expect(result.adopted).toEqual(["/Page", "/Page/Titled[t]", "/Page/Waiting[w]"])
      yield* TestHost.settle
      expect(result.container.textContent).toBe("gonewaiting")
    })))

  it.effect("an instance removed while it waits logs Waiting, then Unmounted, and nothing once its Layer would be ready", () =>
    Effect.gen(function*() {
      class Slow extends Context.Service<Slow, string>()("test/Slow") {}
      class GetText extends Query.Service<GetText>()("GetText", {
        args: {},
        success: Schema.String,
        error: Schema.Never,
        staleTime: "30 seconds"
      }, Effect.succeed(() => Effect.succeed("loaded"))) {}
      const Panel = Component.define({
        name: "Panel",
        props: Schema.Struct({ id: Schema.String }),
        model: Schema.Struct({ label: Schema.String }),
        message: Schema.Never,
        elements: Html,
        queries: { text: { query: GetText, args: () => ({}) } }
      }).make({
        init: ($) => ({ label: `panel ${$.props.id}` }),
        update: (model) => model,
        view: (model, h) => h.p(model.label)
      }).pipe(Component.provide(Layer.effect(Slow, Effect.as(Effect.sleep("50 millis"), "ready"))))
      const Page = Component.define({
        name: "Page",
        model: Schema.Boolean,
        message: Schema.Boolean,
        elements: Html
      }).make({
        init: () => true,
        update: (_, show) => show,
        view: (show, h) => h.div(show ? Panel(h, { key: "p", props: { id: "a" } }) : h.p("gone"))
      })

      const fiber = yield* Effect.forkChild(HtmlServer.renderToHtml(Page, {}).pipe(Effect.provide(GetText.layer)))
      yield* TestClock.adjust("50 millis")
      const rendered = yield* Fiber.join(fiber)
      const app = yield* container(rendered.html)
      expect(app.textContent).toBe("panel a")
      const log = MessageLog.makeMemory({ size: 1000 })
      const root = yield* BrowserHost.mountEffect(Page, {}, app, { state: rendered.state }).pipe(
        Effect.provideService(MessageLog.MessageLog, log),
        Effect.provide(GetText.layer)
      )
      // Removed while its Layer is still building, which then gets the time it would have needed.
      root.send(false)
      yield* tick
      expect(app.textContent).toBe("gone")
      yield* TestClock.adjust("50 millis")
      yield* tick

      const panel = log.entries().filter((entry): entry is MessageLog.InstanceEntry =>
        "path" in entry && entry.path === "/Page/Panel[p]"
      )
      expect(panel.map((entry) => entry._tag)).toEqual(["Waiting", "LayerPending", "Unmounted"])
      expect(new Set(panel.map((entry) => entry.instance)).size).toBe(1)
      // The only entry that says what the server's nodes showed: it crosses the Wire whole.
      const wire = MessageLog.makeEncoder().encode(panel[0]!) as Extract<MessageLog.Wire, { _tag: "Waiting" }>
      expect(wire.props).toEqual({ id: "a" })
      expect(wire.model).toEqual({ label: "panel a" })
      expect((wire.queries as { readonly text: ReadonlyArray<unknown> }).text.slice(0, 3)).toEqual([
        "{}",
        0,
        "loaded"
      ])
      expect(Schema.decodeUnknownSync(MessageLog.Wire)(JSON.parse(JSON.stringify(wire)))).toEqual(wire)
    }).pipe(Effect.scoped))

  it.effect("reports the template results the client's merge computed, without calling templates again", () =>
    hosted(Effect.gen(function*() {
      const Leaf = Component.define({
        name: "Leaf",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        head: () => [Head.title("leaf")],
        view: (_, h) => h.p("leaf")
      })
      const withTemplate = (template: (calls: number) => string) => {
        let calls = 0
        const Parent = Component.define({
          name: "Parent",
          model: Schema.Struct({}),
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => ({}),
          update: (model) => model,
          head: () => [Head.titleTemplate(() => template(calls++))],
          view: (_, h) => h.div(Leaf(h, { key: "l", props: {} }))
        })
        return { Parent, calls: () => calls }
      }

      // One call on the server's merge and one on the client's; reporting adds none. Both return
      // "server", which is what the client shows, so hydration agrees.
      const agrees = withTemplate((calls) => calls < 2 ? "server" : "client")
      const result = yield* ssr(agrees.Parent, {})
      expect(agrees.calls()).toBe(2)
      expect(result.head.title).toBe("server")
      expect(result.document.title).toBe("server")

      // The client's one call differs from the server's, and the report shows the client's.
      const differs = withTemplate((calls) => calls < 1 ? "server" : "client")
      const error = yield* Effect.flip(ssr(differs.Parent, {}))
      expect(differs.calls()).toBe(2)
      expect(error.problems).toEqual(["head title: the server has \"server\", the client \"client\""])
    })))
  it.effect("leaves an instance its own title template fails out of the adoption head, as the server does", () =>
    hosted(Effect.gen(function*() {
      const Leaf = Component.define({
        name: "Leaf",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        head: () => [Head.title("leaf")],
        view: (_, h) => h.p("leaf")
      })
      const Broken = Component.define({
        name: "Broken",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        head: () => [
          Head.titleTemplate(() => {
            throw new Error("template")
          })
        ],
        view: (_, h) => h.div(Leaf(h, { key: "l", props: {} }))
      })
      const Parent = Component.define({
        name: "Parent",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        // Two siblings: the later one's title wins the first merge, so the earlier one's template only
        // throws in the merge after the fallback renders. Mounting drains both before it reports.
        view: (_, h) =>
          h.div(
            Broken(h, { key: "a", props: {}, fallback: () => h.p("fallback a") }),
            Broken(h, { key: "b", props: {}, fallback: () => h.p("fallback b") })
          )
      })
      const result = yield* ssr(Parent, {})
      expect(result.head.title).toBeUndefined()
      expect(result.state["~deferred"]).toEqual(["/Parent/Broken[a]", "/Parent/Broken[b]"])
      expect(result.container.textContent).toBe("fallback afallback b")
    })))

  it.effect("keeps no template results outside an adoption report", () =>
    Effect.gen(function*() {
      let calls = 0
      // One entry shared by every head evaluation, so a cache keyed on entries would keep it.
      const template = Head.titleTemplate((title) => {
        calls++
        return `${title} - App`
      })
      const Leaf = Component.define({
        name: "Leaf",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        head: () => [Head.title("leaf")],
        view: (_, h) => h.p("leaf")
      })
      const Message = Schema.TaggedUnion({ Bump: {} })
      const Layout = Component.define({
        name: "Layout",
        model: Schema.Number,
        message: Message,
        elements: Html
      }).make({
        init: () => 0,
        update: (count) => count + 1,
        head: () => [template],
        view: (count, h) => h.div(h.p(String(count)), Leaf(h, { key: "l", props: {} }))
      })
      const bumpThrice = Effect.fnUntraced(function*(root: { readonly send: (message: typeof Message.Type) => void }) {
        for (let i = 0; i < 3; i++) {
          root.send(Message.make({ _tag: "Bump" }))
          yield* tick
        }
      })

      // A plain mount: each of the four merges (mount and three updates) calls the template.
      const app = yield* container("")
      const mounted = yield* BrowserHost.mountEffect(Layout, {}, app)
      yield* bumpThrice(mounted)
      expect(calls).toBe(4)

      // Hydration: one call on the server's merge, one on the client's, then one per update once
      // the report is made.
      calls = 0
      yield* hosted(Effect.gen(function*() {
        const result = yield* ssr(Layout, {})
        expect(calls).toBe(2)
        for (let i = 0; i < 3; i++) {
          result.root.send(Message.make({ _tag: "Bump" }))
          yield* TestHost.settle
        }
        expect(calls).toBe(5)
        expect(result.document.title).toBe("leaf - App")
      }))
    }).pipe(Effect.scoped))
})

/** A query that counts its fetches and fails for id 404, and an `Item` that watches it by its props. */
const makeItems = () => {
  const calls: Array<number> = []
  class GetItem extends Query.Service<GetItem>()(
    "GetItem",
    {
      args: { id: Schema.Number },
      success: Schema.String,
      error: Schema.String,
      staleTime: "1 minute"
    },
    Effect.succeed(({ id }) =>
      Effect.suspend(() => {
        calls.push(id)
        return id === 404 ? Effect.fail("missing") : Effect.succeed(`Item ${id}`)
      })
    )
  ) {}
  const show = (result: AsyncResult.AsyncResult<string, string>) =>
    AsyncResult.isSuccess(result) ? result.value : AsyncResult.isFailure(result) ? "failed" : "loading"
  const Item = Component.define({
    name: "Item",
    model: Schema.Struct({}),
    message: Schema.Never,
    props: Schema.Struct({ id: Schema.Number }),
    elements: Html,
    queries: { item: { query: GetItem, args: (_model, props) => ({ id: props.id }) } }
  }).make({
    init: () => ({}),
    update: (model) => model,
    view: (_, h) => h.p(show(h.queries.item))
  }).pipe(Component.provide(GetItem.layer))
  return { calls, GetItem, Item, show }
}

describe("HtmlServer queries", { concurrent: false }, () => {
  it.effect("fetches each key once per request and ships every settled entry, typed Failures included", () =>
    hosted(Effect.gen(function*() {
      const { Item, calls } = makeItems()
      const Page = Component.define({
        name: "Page",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) =>
          h.div(
            Item(h, { key: "a", props: { id: 1 } }),
            Item(h, { key: "b", props: { id: 1 } }),
            Item(h, { key: "c", props: { id: 404 } })
          )
      })
      const result = yield* ssr(Page, {})
      expect(result.html).toContain("<p>Item 1</p>")
      expect(result.html).toContain("<p>failed</p>")
      expect(result.state["~query"]).toEqual({
        GetItem: expect.arrayContaining([["{\"id\":1}", 0, "Item 1", 0], ["{\"id\":404}", 1, ["missing"], 0]])
      })
      expect((result.state["~query"] as any).GetItem).toHaveLength(2)
      // The client adopts both entries without fetching, and each instance's hydrated results are on its Mounted.
      expect(calls).toEqual([1, 404])
      expect(result.root.fetches()).toEqual([])
      expect(result.log.filter((entry) => entry._tag === "QueryChanged")).toEqual([])
      expect(result.log.some((entry) => entry._tag === "Update")).toBe(false)
      expect(result.container.textContent).toBe("Item 1Item 1failed")
    })))

  it.effect("runs rounds: an onChange message that changes the args fetches the next key", () =>
    hosted(Effect.gen(function*() {
      const { GetItem, show, calls } = makeItems()
      const Message = Schema.TaggedUnion({ Loaded: { ok: Schema.Boolean } })
      const Pager = Component.define({
        name: "Pager",
        model: Schema.Struct({ page: Schema.Number }),
        message: Message,
        elements: Html,
        queries: {
          item: {
            query: GetItem,
            args: (model) => ({ id: model.page }),
            onChange: (result) => Message.make({ _tag: "Loaded", ok: AsyncResult.isSuccess(result) })
          }
        }
      }).make({
        init: () => ({ page: 1 }),
        update: (model, message) => ({ page: message.ok && model.page < 3 ? model.page + 1 : model.page }),
        view: (_, h) => h.p(show(h.queries.item))
      }).pipe(Component.provide(GetItem.layer))
      const result = yield* ssr(Pager, {})
      expect(result.html).toContain("<p>Item 3</p>")
      expect(calls).toEqual([1, 2, 3])
      expect((result.state["~query"] as any).GetItem.map((tuple: ReadonlyArray<unknown>) => tuple[0])).toEqual([
        "{\"id\":1}",
        "{\"id\":2}",
        "{\"id\":3}"
      ])
      expect(result.root.fetches()).toEqual([])
    })))

  it.effect("ships the k of N keys of a keyed field that settled in budget, and the client fetches the rest", () =>
    hosted(Effect.gen(function*() {
      const calls: Array<number> = []
      class GetSlowItem extends Query.Service<GetSlowItem>()(
        "GetSlowItem",
        { args: { id: Schema.Number }, success: Schema.String, error: Schema.String, staleTime: "1 minute" },
        Effect.succeed(({ id }) =>
          Effect.suspend(() => {
            calls.push(id)
            return id === 404
              ? Effect.fail("missing")
              : Effect.as(Effect.sleep(id === 3 ? "300 millis" : "0 millis"), `Item ${id}`)
          })
        )
      ) {}
      const List = Component.define({
        name: "List",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html,
        queries: { items: { queryMany: GetSlowItem, args: () => [{ id: 1 }, { id: 404 }, { id: 3 }] } }
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) =>
          h.ul(h.queries.items.map(({ args, result }) =>
            h.li.key(String(args.id)).children(
              AsyncResult.isSuccess(result) ? result.value : AsyncResult.isFailure(result) ? "failed" : "loading"
            )
          ))
      }).pipe(Component.provide(GetSlowItem.layer))
      const result = yield* ssr(List, {}, { budget: "50 millis" })
      expect(result.html).toContain("<li>Item 1</li><li>failed</li><li>loading</li>")
      // The result is the settled keys' tuples; the entries ship as ordinary entries of the query.
      expect(result.state["/List"]).toEqual({
        model: {},
        queries: { items: [["{\"id\":1}", 0, "Item 1", 0, false], ["{\"id\":404}", 1, ["missing"], null]] }
      })
      expect((result.state["~query"] as any).GetSlowItem).toHaveLength(2)
      expect(result.misses).toEqual([{ query: "GetSlowItem", logKey: "{\"id\":3}" }])
      // The client adopts the two settled keys and fetches only the third.
      expect(result.root.fetches().map((fetch) => fetch.logKey)).toEqual(["{\"id\":3}"])
      yield* TestClock.adjust("300 millis")
      yield* TestHost.settle
      expect(result.container.textContent).toBe("Item 1failedItem 3")
      expect(calls).toEqual([1, 404, 3, 3])
    })))

  it.effect("fails ssr when an entry doesn't encode, and doesn't ship it", () =>
    hosted(Effect.gen(function*() {
      class GetCount extends Query.Service<GetCount>()("GetCount", {
        args: {},
        success: Schema.Number,
        error: Schema.Never,
        staleTime: "1 minute"
      }, Effect.succeed(() => Effect.succeed("x" as unknown as number))) {}
      const Page = Component.define({
        name: "Page",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html,
        queries: { count: { query: GetCount, args: () => ({}) } }
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("count")
      }).pipe(Component.provide(GetCount.layer))
      const error = yield* Effect.flip(ssr(Page, {}))
      expect(error.problems).toContainEqual(expect.stringMatching(/^EncodeFailed:/))
      yield* TestHost.expectProblem("EncodeFailed")
    })))

  it.effect("fails ssr when the client fetches a hydrated entry inside the window, unless static", () =>
    Effect.gen(function*() {
      const { GetItem, Item, calls } = makeItems()
      class Store extends Context.Service<Store, string>()("test/Store") {}
      let builds = 0
      // Built at once on the server, and 10 millis later on the client.
      const Slow = Component.define({
        name: "Slow",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("slow")
      }).pipe(Component.provide(Layer.effect(
        Store,
        Effect.suspend(() =>
          builds++ % 2 === 0 ? Effect.succeed("ready") : Effect.as(Effect.sleep("10 millis"), "ready")
        )
      )))
      const Message = Schema.TaggedUnion({ Refreshed: {} })
      class Refresh extends Command.Service<Refresh>()("Refresh", {
        args: {},
        invalidates: () => [GetItem]
      }, Effect.succeed(() => Effect.succeed(Message.make({ _tag: "Refreshed" })))) {}
      const Page = Component.define({
        name: "Page",
        model: Schema.Struct({}),
        message: Message,
        elements: Html
      }).make({
        // init's Command reruns on the client, and its invalidation refetches the hydrated entry while
        // the instance below still holds the window open.
        init: ($) => $.set({}).run(Refresh.make()),
        update: (model) => model,
        view: (_, h) => h.div(Item(h, { key: "a", props: { id: 1 } }), Slow(h, { key: "s", props: {} }))
      }).pipe(Component.provide(Refresh.layer))
      yield* hosted(Effect.gen(function*() {
        const error = yield* Effect.flip(ssr(Page, {}))
        expect(error.problems).toEqual([
          "GetItem {\"id\":1}: fetched inside the fetch-free window (invalidation)"
        ])
      }))
      calls.length = 0
      yield* hosted(Effect.gen(function*() {
        const result = yield* ssr(Page, {}, { static: true })
        expect(result.state["~static"]).toBe(true)
        // Static HTML has no window, and its entry has an unknown age: stale, so it refetches once.
        expect(calls).toEqual([1, 1])
        expect(result.root.fetches().some((fetch) => fetch.inWindow)).toBe(false)
      }))
    }))

  it.effect("closes the window at the first navigation, before a waiting instance adopts", () =>
    Effect.gen(function*() {
      const { GetItem, Item, calls } = makeItems()
      class Store extends Context.Service<Store, string>()("test/Store") {}
      let builds = 0
      const Slow = Component.define({
        name: "Slow",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("slow")
      }).pipe(Component.provide(Layer.effect(
        Store,
        Effect.suspend(() => builds++ === 0 ? Effect.succeed("ready") : Effect.as(Effect.sleep("10 millis"), "ready"))
      )))
      const Message = Schema.TaggedUnion({ Navigated: {}, Refreshed: {} })
      class Refresh extends Command.Service<Refresh>()("Refresh", {
        args: {},
        invalidates: () => [GetItem]
      }, Effect.succeed(() => Effect.succeed(Message.make({ _tag: "Refreshed" })))) {}
      const Page = Component.define({
        name: "Page",
        model: Schema.Struct({}),
        message: Message,
        elements: Html
      }).make({
        // On the client, init navigates, and only then invalidates: the fetch lands after the window closed.
        init: ($) =>
          $.set({}).run(
            Router.push(AppRoute, Option.getOrThrow(AppRoute.parse("/slow"))).pipe(
              Command.map(() => Message.make({ _tag: "Navigated" }))
            )
          ),
        update: (model, message, $) => message._tag === "Navigated" ? $.set(model).run(Refresh.make()) : model,
        view: (_, h) => h.div(Item(h, { key: "a", props: { id: 1 } }), Slow(h, { key: "s", props: {} }))
      }).pipe(Component.provide(Refresh.layer))
      const { router } = yield* routed("/")
      yield* hosted(Effect.gen(function*() {
        const result = yield* ssr(Page, {}).pipe(Effect.provide(router))
        expect(result.root.fetches().map((fetch) => [fetch.trigger, fetch.inWindow])).toEqual([["invalidation", false]])
        expect(calls).toEqual([1, 1])
      }))
    }))

  it.effect("runs a push's Router.prefetch after the navigation closes the fetch-free window", () =>
    Effect.gen(function*() {
      // Always stale: inside the window a prefetch leaves the hydrated entry alone, and after it, fetches it.
      class GetNow extends Query.Service<GetNow>()("GetNow", {
        args: { id: Schema.Number },
        success: Schema.String,
        error: Schema.Never,
        staleTime: 0
      }, Effect.succeed(({ id }) => Effect.succeed(`Now ${id}`))) {}
      const Now = Component.define({
        name: "Now",
        props: Schema.Struct({ id: Schema.Number }),
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html,
        queries: { now: { query: GetNow, args: (_model, props) => ({ id: props.id }) } }
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("now")
      })
      // Holds the window open on the client: the instance waits 10 millis for its Layer.
      class Store extends Context.Service<Store, string>()("test/Store") {}
      let builds = 0
      const Slow = Component.define({
        name: "Slow",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("slow")
      }).pipe(Component.provide(Layer.effect(
        Store,
        Effect.suspend(() => builds++ === 0 ? Effect.succeed("ready") : Effect.as(Effect.sleep("10 millis"), "ready"))
      )))
      const Message = Schema.TaggedUnion({ Navigated: {} })
      const Page = Component.define({
        name: "Page",
        model: Schema.Struct({}),
        message: Message,
        elements: Html
      }).make({
        // On the client, init navigates while the instance holds the window open.
        init: ($) =>
          $.set({}).run(
            Router.push(AppRoute, Option.getOrThrow(AppRoute.parse("/people/1"))).pipe(
              Command.map(() => Message.make({ _tag: "Navigated" }))
            )
          ),
        update: (model) => model,
        subscriptions: () => [
          Router.prefetch(AppRoute, {
            Home: () => [],
            Person: ({ params }) => [Router.page(Now, { id: params.id })],
            Search: () => [],
            Slow: () => [],
            NotFound: () => []
          })
        ],
        // The mounted page is older than the push, so the check after it skips it.
        view: (_, h) => h.div(Now(h, { key: "a", props: { id: 1 } }), Slow(h, { key: "s", props: {} }))
      }).pipe(Component.provide(GetNow.layer))
      const { router } = yield* routed("/")
      yield* hosted(Effect.gen(function*() {
        const result = yield* ssr(Page, {}).pipe(Effect.provide(router))
        expect(result.root.fetches().map((fetch) => [fetch.logKey, fetch.trigger, fetch.inWindow])).toEqual([
          ["{\"id\":1}", "prefetch", false]
        ])
      }))
    }))

  it.effect("allows a caller-only fetch inside the window: it stores nothing", () =>
    hosted(Effect.gen(function*() {
      const { GetItem, Item } = makeItems()
      class ReadBack extends Command.Service<ReadBack>()(
        "ReadBack",
        {
          args: {},
          invalidates: () => [GetItem]
        },
        Effect.map(Effect.context<InstanceType<typeof GetItem>>(), (context) => () =>
          // Reads back its own invalidation target, then never ends, so the fetch stays caller-only.
          Effect.andThen(GetItem.get({ id: 1 }).pipe(Effect.provide(context), Effect.ignore), Effect.never))
      ) {}
      class Store extends Context.Service<Store, string>()("test/Store") {}
      let builds = 0
      const Slow = Component.define({
        name: "Slow",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("slow")
      }).pipe(Component.provide(Layer.effect(
        Store,
        Effect.suspend(() => builds++ === 0 ? Effect.succeed("ready") : Effect.as(Effect.sleep("10 millis"), "ready"))
      )))
      const Page = Component.define({
        name: "Page",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: ($) => $.set({}).run(ReadBack.make()),
        update: (model) => model,
        view: (_, h) => h.div(Item(h, { key: "a", props: { id: 1 } }), Slow(h, { key: "s", props: {} }))
      }).pipe(Component.provide(ReadBack.layer.pipe(Layer.provideMerge(GetItem.layer))))
      const result = yield* ssr(Page, {})
      expect(result.root.fetches().map((fetch) => [fetch.stored, fetch.inWindow])).toEqual([[false, true]])
    })))

  it.effect("spends the whole budget on the client before failing, for a sleep its clock didn't see", () =>
    hosted(Effect.gen(function*() {
      const clock = yield* Clock.Clock
      class Store extends Context.Service<Store, string>()("test/Store") {}
      let builds = 0
      const Panel = Component.define({
        name: "Panel",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("panel")
      }).pipe(Component.provide(Layer.effect(
        Store,
        Effect.suspend(() =>
          builds++ === 0 ? Effect.succeed("ready") : Effect.as(clock.sleep(Duration.millis(10)), "ready")
        )
      )))
      const Page = Component.define({
        name: "Page",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => Panel(h, { key: "p", props: {} })
      })
      const result = yield* ssr(Page, {}, { budget: "100 millis" })
      expect(result.adopted).toEqual(["/Page", "/Page/Panel[p]"])
    })))

  it.effect("fails ssr naming the instances still waiting for their Layer when the budget is spent", () =>
    hosted(Effect.gen(function*() {
      class Store extends Context.Service<Store, string>()("test/Store") {}
      let builds = 0
      const Panel = Component.define({
        name: "Panel",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.p("panel")
      }).pipe(
        Component.provide(Layer.effect(
          Store,
          Effect.suspend(() => builds++ === 0 ? Effect.succeed("ready") : Effect.never)
        ))
      )
      const Page = Component.define({
        name: "Page",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) => h.div(Panel(h, { key: "p", props: {} }))
      })
      const error = yield* Effect.flip(ssr(Page, {}, { budget: "1 second" }))
      expect(error.problems).toEqual([
        "/Page/Panel[p]: still waiting for its Layer to adopt when the budget was spent"
      ])
    })))
})
