// @vitest-environment happy-dom
import { Command, Component, Route, Router, UiSchema } from "@effect/ui"
import {
  BrowserHost,
  BrowserRouter,
  Html,
  HtmlHydrate,
  HtmlServer
} from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Redacted, Schema, SchemaGetter } from "effect"

const hotKey = Symbol.for("@effect/ui/hot")

const triggerHotSave = () =>
  (window as unknown as Record<symbol, (() => void) | undefined>)[hotKey]?.()

const tick = Effect.promise(() =>
  new Promise<void>((resolve) => setTimeout(resolve, 0))
)

const inContainer = <A, E, R>(
  id: string | undefined,
  body: (container: HTMLDivElement) => Effect.Effect<A, E, R>
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const div = document.createElement("div")
      if (id !== undefined) div.id = id
      document.body.appendChild(div)
      return div
    }),
    body,
    (div) => Effect.sync(() => div.remove())
  ).pipe(Effect.scoped)

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
    "preserves compatible state (restore, keepAlive, preloaded lazy), isolates container IDs, survives broken reload, and resets on manual refresh",
    () =>
      Effect.gen(function*() {
        sessionStorage.clear()
        const Msg = UiSchema.TaggedEnum({ Inc: {}, Fill: {}, Hide: {} })
        const Login = Html.component({
          name: "Login",
          model: Schema.Struct({
            email: Schema.String,
            password: Schema.String
          }),
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
        const counter = (name: string, restore?: false) =>
          Html.component({
            name,
            model: Schema.Number,
            message: Msg,
            restore
          }).make({
            init: () => 0,
            update: ($) => $.model + 1,
            view: (h, count) =>
              h.button.onClick(Msg.Inc()).children(`${name}=${count}`)
          })
        const Ephemeral = counter("ephemeral", false)
        const Kept = counter("kept")
        const LazyTarget = counter("lazy")
        const LazyChild = Component.lazy(
          "lazy",
          () => Promise.resolve(LazyTarget)
        )
        yield* Effect.promise(() => LazyChild.preload())
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
              h.span(`count=${model.count}`),
              Login(h, { key: "login" }),
              Ephemeral(h, { key: "ephemeral" }),
              LazyChild(h, { key: "l", fallback: () => h.span("loading") }),
              model.shown ? h.keepAlive((s) => Kept(s, { key: "kept" })) : null
            )
        })

        yield* inContainer("app", (el) =>
          Effect.gen(function*() {
            const root = yield* BrowserHost.mountEffect(App, {}, el)
            root.send(Msg.Inc())
            root.send(Msg.Inc())
            for (const button of el.querySelectorAll("button")) button.click()
            root.send(Msg.Hide())
            yield* tick
            assert.include(el.textContent ?? "", "count=2")
            assert.include(el.textContent ?? "", "ada@example.com|secret")
            assert.include(el.textContent ?? "", "ephemeral=1")
            assert.include(el.textContent ?? "", "lazy=1")
            triggerHotSave()
          }))

        triggerHotSave()

        yield* inContainer("other", (other) =>
          inContainer(undefined, (anon) =>
            inContainer("app", (el) =>
              Effect.gen(function*() {
                yield* BrowserHost.mountEffect(App, {}, other)
                yield* BrowserHost.mountEffect(App, {}, anon)
                const root = yield* BrowserHost.mountEffect(App, {}, el)
                yield* tick
                assert.include(other.textContent ?? "", "count=0")
                assert.include(anon.textContent ?? "", "count=0")
                assert.include(el.textContent ?? "", "count=2")
                assert.include(el.textContent ?? "", "ada@example.com|")
                assert.notInclude(el.textContent ?? "", "secret")
                assert.include(el.textContent ?? "", "ephemeral=0")
                assert.include(el.textContent ?? "", "lazy=1")
                root.send(Msg.Hide())
                yield* tick
                assert.include(el.textContent ?? "", "kept=1")
              }))))

        yield* inContainer("app", (el) =>
          Effect.gen(function*() {
            yield* BrowserHost.mountEffect(App, {}, el)
            yield* tick
            assert.include(el.textContent ?? "", "count=0")
            assert.include(el.textContent ?? "", "lazy=0")
            assert.include(el.textContent ?? "", "kept=0")
          }))
      })
  )

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

        yield* inContainer("warn-app", (el) =>
          Effect.gen(function*() {
            const root = yield* BrowserHost.mountEffect(ParentV1, {}, el).pipe(
              Effect.provide(SlowWork.layer)
            )
            root.send(Msg.Bump())
            root.send(Msg.Bump())
            root.send(Msg.Start())
            yield* tick
            triggerHotSave()
          }))

        assert.notInclude(
          sessionStorage.getItem("@effect/ui/hot") ?? "",
          "tok_123"
        )

        const { warnings } = yield* captureWarnings(
          inContainer("warn-app", (el) =>
            Effect.gen(function*() {
              yield* BrowserHost.mountEffect(ParentV2, {}, el).pipe(
                Effect.provide(SlowWork.layer)
              )
              yield* tick
              assert.include(el.textContent ?? "", "parent=2")
              assert.include(el.textContent ?? "", "child=fresh")
            }))
        )

        const joined = warnings.join("\n")
        assert.include(joined, "/Parent/Child[c] restarted from init")
        assert.include(joined, "Schema.Redacted")
        assert.include(joined, "interrupted in-flight Commands")
        assert.include(joined, "test/SlowWork")
      })
  )

  it.live(
    "overrides HtmlHydrate server HTML on hot reload without duplicating nodes",
    () =>
      Effect.gen(function*() {
        sessionStorage.clear()
        const Msg = UiSchema.TaggedEnum({ Inc: {} })
        const Counter = Html.component({
          name: "HydratedCounter",
          model: Schema.Number,
          message: Msg
        }).make({
          init: () => 0,
          update: ($) => $.model + 1,
          view: (h, count) => h.p(`count=${count}`)
        })

        const rendered = yield* HtmlServer.renderToHtml(Counter, {})

        yield* inContainer("ssr", (el) =>
          Effect.gen(function*() {
            const root = yield* BrowserHost.mountEffect(Counter, {}, el)
            root.send(Msg.Inc())
            root.send(Msg.Inc())
            yield* tick
            assert.strictEqual(el.textContent, "count=2")
            triggerHotSave()
          }))

        yield* inContainer("ssr", (el) =>
          Effect.gen(function*() {
            el.innerHTML = rendered.html
            const root = yield* HtmlHydrate.hydrateEffect(
              Counter,
              {},
              el,
              rendered.state
            )
            yield* root.adopted
            yield* tick
            assert.strictEqual(el.textContent, "count=2")
            assert.strictEqual(el.querySelectorAll("p").length, 1)
          }))
      })
  )

  it.live(
    "preserves compatible descendants under an async-decoding parent whether its decode succeeds or fails",
    () =>
      Effect.gen(function*() {
        sessionStorage.clear()
        const Msg = UiSchema.TaggedEnum({ Set: { text: Schema.String } })
        const Field = Html.component({
          name: "Field",
          model: Schema.String,
          message: Msg
        }).make({
          init: () => "init-field",
          update: (_, msg) => msg.text,
          view: (h, text) =>
            h.button.onClick(Msg.Set({ text: "typed" })).children(
              `field=${text}`
            )
        })
        const makeAsyncHost = <M, E>(
          parentSchema: Schema.Codec<M, E>,
          parentInit: M
        ) => {
          const AsyncParent = Html.component({
            name: "AsyncParent",
            model: parentSchema,
            message: Schema.Never
          }).make({
            init: () => parentInit,
            update: ($) => $.model,
            view: (h, value) =>
              h.div(
                h.span(`parent=${String(value)}`),
                Field(h, { key: "f" })
              )
          })
          return Html.component({
            name: "AsyncRoot",
            model: Schema.Null,
            message: Schema.Never
          }).make({
            init: () => null,
            update: ($) => $.model,
            view: (h) => h.div(AsyncParent(h, { key: "p" }))
          })
        }

        const delayed = <M, E>(schema: Schema.Codec<M, E>) =>
          schema.pipe(Schema.decode({
            decode: SchemaGetter.transformEffect((value: M) =>
              Effect.as(Effect.sleep("15 millis"), value)
            ),
            encode: SchemaGetter.passthrough()
          }))

        const V1 = makeAsyncHost(delayed(Schema.String), "saved-parent")
        const V2Incompatible = makeAsyncHost(delayed(Schema.Number), 99)

        yield* inContainer("async-app", (el) =>
          Effect.gen(function*() {
            yield* BrowserHost.mountEffect(V1, {}, el)
            yield* tick
            el.querySelector("button")!.click()
            yield* tick
            assert.include(el.textContent ?? "", "field=typed")
            triggerHotSave()
          }))

        yield* inContainer("async-app", (el) =>
          Effect.gen(function*() {
            yield* BrowserHost.mountEffect(V1, {}, el)
            yield* Effect.sleep("40 millis")
            assert.include(el.textContent ?? "", "parent=saved-parent")
            assert.include(el.textContent ?? "", "field=typed")
            triggerHotSave()
          }))

        const { warnings } = yield* captureWarnings(
          inContainer("async-app", (el) =>
            Effect.gen(function*() {
              yield* BrowserHost.mountEffect(V2Incompatible, {}, el)
              yield* Effect.sleep("40 millis")
              assert.include(el.textContent ?? "", "parent=99")
              assert.include(el.textContent ?? "", "field=typed")
            }))
        )
        assert.include(
          warnings.join("\n"),
          "/AsyncRoot/AsyncParent[p] restarted from init"
        )
      })
  )

  it.live(
    "prefers hot snapshot over BrowserRouter history.state and does not leak stale history state onto a later route",
    () =>
      Effect.gen(function*() {
        sessionStorage.clear()
        window.history.replaceState(null, "", "/")
        const AppRoute = Route.union({
          Home: Route.make("/"),
          Next: Route.make("/next")
        })
        const ChildMsg = UiSchema.TaggedEnum({ Set: { text: Schema.String } })
        const Draft = Html.component({
          name: "Draft",
          model: Schema.String,
          message: ChildMsg
        }).make({
          init: () => "init",
          update: (_, msg) => msg.text,
          view: (h, text) =>
            h.div(
              h.span(`draft=${text}`),
              h.button.onClick(ChildMsg.Set({ text: "history" })).children(
                "set-history"
              ),
              h.button.onClick(ChildMsg.Set({ text: "hot" })).children(
                "set-hot"
              )
            )
        })
        const AppMsg = UiSchema.TaggedEnum({
          ChangedRoute: { route: AppRoute },
          Toggle: {},
          Go: { route: AppRoute }
        })
        const App = Html.component({
          name: "HistoryLeakApp",
          props: Schema.Struct({ route: AppRoute }),
          model: Schema.Struct({ route: AppRoute, shown: Schema.Boolean }),
          message: AppMsg
        }).make({
          init: ($) => ({ route: $.props.route, shown: true }),
          update: ($, msg) =>
            AppMsg.match(msg, {
              ChangedRoute: ({ route }) => ({ route, shown: true }),
              Toggle: () => ({ ...$.model, shown: !$.model.shown }),
              Go: ({ route }) =>
                $.run(Router.push(AppRoute, route).pipe(Command.asNoop))
            }),
          subscriptions: ({ model }) => [
            Router.subscription(
              AppRoute,
              model.route,
              (route) => AppMsg.ChangedRoute({ route })
            )
          ],
          view: (h, model) =>
            h.div(model.shown ? Draft(h, { key: "shared" }) : null)
        })

        yield* inContainer("leak-app", (el) =>
          Effect.gen(function*() {
            const root = yield* BrowserHost.mountEffect(
              App,
              Router.props(AppRoute),
              el
            )
            yield* tick
            el.querySelectorAll("button")[0]!.click()
            yield* tick
            assert.include(el.textContent ?? "", "draft=history")
            root.send(AppMsg.Go({ route: AppRoute.Next() }))
            yield* tick
            window.history.back()
            yield* Effect.sleep("20 millis")
            el.querySelectorAll("button")[1]!.click()
            yield* tick
            assert.include(el.textContent ?? "", "draft=hot")
            triggerHotSave()
          }).pipe(Effect.provide(BrowserRouter.layer({ routes: AppRoute }))))

        yield* inContainer("leak-app", (el) =>
          Effect.gen(function*() {
            const root = yield* BrowserHost.mountEffect(
              App,
              Router.props(AppRoute),
              el
            )
            yield* tick
            assert.include(el.textContent ?? "", "draft=hot")
            root.send(AppMsg.Toggle())
            yield* tick
            root.send(AppMsg.Go({ route: AppRoute.Next() }))
            yield* tick
            assert.include(el.textContent ?? "", "draft=init")
          }).pipe(Effect.provide(BrowserRouter.layer({ routes: AppRoute }))))
      })
  )

  it.live(
    "does not replay init Commands on hot reload adoption while still running them on incompatible resets",
    () =>
      Effect.gen(function*() {
        sessionStorage.clear()
        let runs = 0
        const PickApple = Command.make(
          "test/PickApple",
          { args: {} },
          () => Effect.sync(() => ++runs * 10)
        )
        const Msg = UiSchema.TaggedEnum({
          Picked: { apple: Schema.Number },
          Bump: {}
        })
        const GameV1 = Html.component({
          name: "InitCommandGame",
          model: Schema.Struct({ apple: Schema.Number, score: Schema.Number }),
          message: Msg
        }).make({
          init: ($) =>
            $.set({ apple: 0, score: 0 }).run(
              PickApple.make({}).pipe(
                Command.map((apple) => Msg.Picked({ apple }))
              )
            ),
          update: ($, msg) =>
            Msg.match(msg, {
              Picked: ({ apple }) => ({ ...$.model, apple }),
              Bump: () => ({ ...$.model, score: $.model.score + 1 })
            }),
          view: (h, model) =>
            h.span(`apple=${model.apple}|score=${model.score}`)
        })
        const GameV2 = Html.component({
          name: "InitCommandGame",
          model: Schema.Struct({ apple: Schema.String, score: Schema.Number }),
          message: Msg
        }).make({
          init: ($) =>
            $.set({ apple: "none", score: 0 }).run(
              PickApple.make({}).pipe(
                Command.map((apple) => Msg.Picked({ apple }))
              )
            ),
          update: ($, msg) =>
            Msg.match(msg, {
              Picked: ({ apple }) => ({ ...$.model, apple: `v2-${apple}` }),
              Bump: () => ({ ...$.model, score: $.model.score + 1 })
            }),
          view: (h, model) =>
            h.span(`apple=${model.apple}|score=${model.score}`)
        })

        yield* inContainer("init-cmd", (el) =>
          Effect.gen(function*() {
            const root = yield* BrowserHost.mountEffect(GameV1, {}, el)
            yield* tick
            root.send(Msg.Bump())
            yield* tick
            assert.strictEqual(runs, 1)
            assert.strictEqual(el.textContent, "apple=10|score=1")
            triggerHotSave()
          }))

        yield* inContainer("init-cmd", (el) =>
          Effect.gen(function*() {
            yield* BrowserHost.mountEffect(GameV1, {}, el)
            yield* tick
            assert.strictEqual(runs, 1)
            assert.strictEqual(el.textContent, "apple=10|score=1")
            triggerHotSave()
          }))

        yield* captureWarnings(
          inContainer("init-cmd", (el) =>
            Effect.gen(function*() {
              yield* BrowserHost.mountEffect(GameV2, {}, el)
              yield* tick
              assert.strictEqual(runs, 2)
              assert.strictEqual(el.textContent, "apple=v2-20|score=0")
            }))
        )
      })
  )
})
