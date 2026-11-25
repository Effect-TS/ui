// @vitest-environment happy-dom
import { Command, Route, Router, UiSchema } from "@effect/ui"
import {
  BrowserHost,
  BrowserRouter,
  Html,
  HtmlHydrate,
  HtmlServer
} from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Redacted, Schema } from "effect"

const hotKey = Symbol.for("@effect/ui/hot")

const triggerHotSave = () => {
  const slot = (window as unknown as Record<
    symbol,
    { readonly save?: (() => void) | null } | undefined
  >)[hotKey]
  slot?.save?.()
}

const makeContainer = (id?: string) => {
  const div = document.createElement("div")
  if (id !== undefined) div.id = id
  document.body.appendChild(div)
  return div
}

const captureWarnings = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.suspend(() => {
    const warnings: Array<string> = []
    const original = console.warn
    console.warn = (...args: ReadonlyArray<unknown>) => {
      warnings.push(args.map(String).join(" "))
    }
    return effect.pipe(
      Effect.map((value) => ({ value, warnings })),
      Effect.ensuring(Effect.sync(() => {
        console.warn = original
      }))
    )
  })

describe("hot reload", { concurrent: false }, () => {
  it.live(
    "preserves state across reload, honours restore, survives broken reload, and resets on manual refresh",
    () =>
      Effect.gen(function*() {
      sessionStorage.clear()
      const Msg = UiSchema.TaggedEnum({
        Inc: {},
        Fill: {},
        Hide: {}
      })
      const Login = Html.component({
        name: "Login",
        model: Schema.Struct({ email: Schema.String, password: Schema.String }),
        message: Msg,
        restore: (model) => ({ ...model, password: "" })
      }).make({
        init: () => ({ email: "", password: "" }),
        update: () => ({ email: "ada@example.com", password: "secret" }),
        view: (h, model) =>
          h.button.onClick(Msg.Fill()).children(
            `${model.email}|${model.password}`
          )
      })
      const Ephemeral = Html.component({
        name: "Ephemeral",
        model: Schema.Number,
        message: Msg,
        restore: false
      }).make({
        init: () => 0,
        update: ($) => $.model + 1,
        view: (h, count) =>
          h.button.onClick(Msg.Inc()).children(`ephemeral ${count}`)
      })
      const Kept = Html.component({
        name: "Kept",
        model: Schema.Number,
        message: Msg
      }).make({
        init: () => 0,
        update: ($) => $.model + 1,
        view: (h, count) =>
          h.button.onClick(Msg.Inc()).children(`kept ${count}`)
      })
      const App = Html.component({
        name: "App",
        model: Schema.Struct({ count: Schema.Number, shown: Schema.Boolean }),
        message: Msg
      }).make({
        init: () => ({ count: 0, shown: true }),
        update: ($, msg) =>
          Msg.match(msg, {
            Inc: () => ({ ...$.model, count: $.model.count + 1 }),
            Fill: () => $.model,
            Hide: () => ({ ...$.model, shown: !$.model.shown })
          }),
        view: (h, model) =>
          h.div(
            h.span(`count ${model.count}`),
            Login(h, { key: "login" }),
            Ephemeral(h, { key: "ephemeral" }),
            model.shown ? h.keepAlive((s) => Kept(s, { key: "kept" })) : null
          )
      })

      // Mount, mutate state (including a parked keepAlive child), then save before reload.
      const first = makeContainer("app")
      yield* Effect.gen(function*() {
        const root = yield* BrowserHost.mountEffect(App, {}, first)
        root.send(Msg.Inc())
        root.send(Msg.Inc())
        for (const button of first.querySelectorAll("button")) button.click()
        root.send(Msg.Hide())
        yield* Effect.sleep("10 millis")
        assert.include(first.textContent ?? "", "count 2")
        assert.include(first.textContent ?? "", "ada@example.com|secret")
        assert.include(first.textContent ?? "", "ephemeral 1")
        triggerHotSave()
      }).pipe(Effect.scoped)
      first.remove()

      // Simulate a broken reload where no root mounts and vite:beforeFullReload fires again.
      triggerHotSave()

      // Remount after reload: compatible state + parked keepAlive survive, restore is honoured.
      const second = makeContainer("app")
      yield* Effect.gen(function*() {
        const root = yield* BrowserHost.mountEffect(App, {}, second)
        yield* Effect.sleep("10 millis")
        assert.include(second.textContent ?? "", "count 2")
        assert.include(second.textContent ?? "", "ada@example.com|")
        assert.notInclude(second.textContent ?? "", "secret")
        assert.include(second.textContent ?? "", "ephemeral 0")
        // Reveal parked keepAlive child: it restores its saved count.
        root.send(Msg.Hide())
        yield* Effect.sleep("10 millis")
        assert.include(second.textContent ?? "", "kept 1")
      }).pipe(Effect.scoped)
      second.remove()

      // Manual refresh (no hot save): starts cleanly from init.
      const third = makeContainer("app")
      yield* Effect.gen(function*() {
        yield* BrowserHost.mountEffect(App, {}, third)
        yield* Effect.sleep("10 millis")
        assert.include(third.textContent ?? "", "count 0")
        assert.include(third.textContent ?? "", "kept 0")
      }).pipe(Effect.scoped)
      third.remove()
    }))

  it.live(
    "warns on incompatible edits, Schema.Redacted, and interrupted Commands while keeping compatible siblings",
    () =>
      Effect.gen(function*() {
      sessionStorage.clear()
      const gate = yield* Deferred.make<void>()
      class SlowWork extends Command.Service<SlowWork>()(
        "test/SlowWork",
        { args: {} },
        Effect.succeed(() => Deferred.await(gate))
      ) {}
      const Msg = UiSchema.TaggedEnum({ Bump: {}, Start: {}, Done: {} })
      const makeParent = <M, E>(
        childModel: Schema.Codec<M, E>,
        childInit: M
      ) => {
        const Child = Html.component({
          name: "Child",
          model: childModel,
          message: Msg
        }).make({
          init: () => childInit,
          update: ($) => $.model,
          view: (h, value) => h.span(`child=${String(value)}`)
        })
        const Secret = Html.component({
          name: "Secret",
          model: Schema.Struct({ token: Schema.Redacted(Schema.String) }),
          message: Msg
        }).make({
          init: () => ({ token: Redacted.make("tok_123") }),
          update: ($) => $.model,
          view: (h) => h.span("secret")
        })
        return Html.component({
          name: "Parent",
          model: Schema.Number,
          message: Msg
        }).make({
          init: () => 0,
          update: ($, msg) =>
            Msg.match(msg, {
              Bump: () => $.model + 1,
              Start: () =>
                $.run(SlowWork.make({}).pipe(Command.map(() => Msg.Done()))),
              Done: () => $.model
            }),
          view: (h, count) =>
            h.div(
              h.span(`parent=${count}`),
              Child(h, { key: "c" }),
              Secret(h, { key: "s" })
            )
        })
      }

      const ParentV1 = makeParent(Schema.Number, 7)
      const ParentV2 = makeParent(Schema.String, "fresh")

      const first = makeContainer("warn-app")
      yield* Effect.gen(function*() {
        const root = yield* BrowserHost.mountEffect(ParentV1, {}, first).pipe(
          Effect.provide(SlowWork.layer)
        )
        root.send(Msg.Bump())
        root.send(Msg.Bump())
        root.send(Msg.Start())
        yield* Effect.sleep("10 millis")
        triggerHotSave()
      }).pipe(Effect.scoped)
      first.remove()

      // Secrets must never be written to sessionStorage.
      assert.notInclude(
        sessionStorage.getItem("@effect/ui/hot") ?? "",
        "tok_123"
      )

      const second = makeContainer("warn-app")
      const { warnings } = yield* captureWarnings(
        Effect.gen(function*() {
          yield* BrowserHost.mountEffect(ParentV2, {}, second).pipe(
            Effect.provide(SlowWork.layer)
          )
          yield* Effect.sleep("10 millis")
          assert.include(second.textContent ?? "", "parent=2")
          assert.include(second.textContent ?? "", "child=fresh")
        }).pipe(Effect.scoped)
      )
      second.remove()

      const joined = warnings.join("\n")
      assert.include(joined, "/Parent/Child[c] restarted from init")
      assert.include(joined, "Schema.Redacted")
      assert.include(joined, "interrupted in-flight Commands")
      assert.include(joined, "test/SlowWork")
    }))

  it.live(
    "overrides HtmlHydrate server HTML and BrowserRouter history.state on hot reload",
    () =>
      Effect.gen(function*() {
      sessionStorage.clear()
      const AppRoute = Route.union({
        Home: Route.make("/"),
        Other: Route.make("/other")
      })
      const Msg = UiSchema.TaggedEnum({
        ChangedRoute: { route: AppRoute },
        Inc: {}
      })
      const App = Html.component({
        name: "RoutedApp",
        props: Schema.Struct({ route: AppRoute }),
        model: Schema.Struct({ route: AppRoute, count: Schema.Number }),
        message: Msg
      }).make({
        init: ($) => ({ route: $.props.route, count: 0 }),
        update: ($, msg) =>
          Msg.match(msg, {
            ChangedRoute: ({ route }) => ({ ...$.model, route }),
            Inc: () => ({ ...$.model, count: $.model.count + 1 })
          }),
        subscriptions: ({ model }) => [
          Router.subscription(
            AppRoute,
            model.route,
            (route) => Msg.ChangedRoute({ route })
          )
        ],
        view: (h, model) => h.p(`routed=${model.count}`)
      })

      // Render fresh SSR HTML (count=0)
      const rendered = yield* HtmlServer.renderToHtml(
        App,
        Router.props(AppRoute)
      ).pipe(Effect.provide(Router.static({ routes: AppRoute, url: "/" })))

      // Mount, increment to 4, and save hot snapshot.
      const first = makeContainer("routed")
      yield* Effect.gen(function*() {
        const root = yield* BrowserHost.mountEffect(
          App,
          Router.props(AppRoute),
          first
        )
        root.send(Msg.Inc())
        root.send(Msg.Inc())
        root.send(Msg.Inc())
        root.send(Msg.Inc())
        yield* Effect.sleep("10 millis")
        assert.strictEqual(first.textContent, "routed=4")
        triggerHotSave()
      }).pipe(
        Effect.scoped,
        Effect.provide(BrowserRouter.layer({ routes: AppRoute }))
      )
      first.remove()

      // Hydrate over server's init HTML: hot snapshot wins and does not duplicate nodes.
      const second = makeContainer("routed")
      second.innerHTML = rendered.html
      yield* Effect.gen(function*() {
        const root = yield* HtmlHydrate.hydrateEffect(
          App,
          Router.props(AppRoute),
          second,
          rendered.state
        )
        yield* root.adopted
        yield* Effect.sleep("10 millis")
        assert.strictEqual(second.textContent, "routed=4")
        assert.strictEqual(second.querySelectorAll("p").length, 1)
      }).pipe(
        Effect.scoped,
        Effect.provide(BrowserRouter.layer({ routes: AppRoute }))
      )
      second.remove()
    }))
})
