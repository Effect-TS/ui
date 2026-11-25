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

        triggerHotSave()

        const second = makeContainer("app")
        yield* Effect.gen(function*() {
          const root = yield* BrowserHost.mountEffect(App, {}, second)
          yield* Effect.sleep("10 millis")
          assert.include(second.textContent ?? "", "count 2")
          assert.include(second.textContent ?? "", "ada@example.com|")
          assert.notInclude(second.textContent ?? "", "secret")
          assert.include(second.textContent ?? "", "ephemeral 0")
          root.send(Msg.Hide())
          yield* Effect.sleep("10 millis")
          assert.include(second.textContent ?? "", "kept 1")
        }).pipe(Effect.scoped)
        second.remove()

        const third = makeContainer("app")
        yield* Effect.gen(function*() {
          yield* BrowserHost.mountEffect(App, {}, third)
          yield* Effect.sleep("10 millis")
          assert.include(third.textContent ?? "", "count 0")
          assert.include(third.textContent ?? "", "kept 0")
        }).pipe(Effect.scoped)
        third.remove()
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
      })
  )

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

        const rendered = yield* HtmlServer.renderToHtml(
          App,
          Router.props(AppRoute)
        ).pipe(Effect.provide(Router.static({ routes: AppRoute, url: "/" })))

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
      })
  )

  it.live(
    "restores a preloaded Component.lazy child without failing its parent or sibling",
    () =>
      Effect.gen(function*() {
        sessionStorage.clear()
        const Msg = UiSchema.TaggedEnum({ Inc: {} })
        const Target = Html.component({
          name: "LazyTarget",
          model: Schema.Number,
          message: Msg
        }).make({
          init: () => 0,
          update: ($) => $.model + 1,
          view: (h, count) =>
            h.button.onClick(Msg.Inc()).children(`lazy=${count}`)
        })
        const LazyChild = Component.lazy("LazyTarget", () =>
          Promise.resolve(Target))
        yield* Effect.promise(() =>
          LazyChild.preload()
        )
        const Host = Html.component({
          name: "LazyHost",
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            h.div(
              LazyChild(h, { key: "a", fallback: () => h.span("loading") }),
              h.span("sibling")
            )
        })

        const first = makeContainer("lazy-app")
        yield* Effect.gen(function*() {
          yield* BrowserHost.mountEffect(Host, {}, first)
          yield* Effect.sleep("10 millis")
          first.querySelector("button")!.click()
          yield* Effect.sleep("10 millis")
          assert.include(first.textContent ?? "", "lazy=1")
          triggerHotSave()
        }).pipe(Effect.scoped)
        first.remove()

        const second = makeContainer("lazy-app")
        yield* Effect.gen(function*() {
          yield* BrowserHost.mountEffect(Host, {}, second)
          yield* Effect.sleep("10 millis")
          assert.include(second.textContent ?? "", "lazy=1")
          assert.include(second.textContent ?? "", "sibling")
        }).pipe(Effect.scoped)
        second.remove()
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

        const AsyncString = Schema.String.pipe(Schema.decode({
          decode: SchemaGetter.transformEffect((text: string) =>
            Effect.as(Effect.sleep("20 millis"), text)
          ),
          encode: SchemaGetter.passthrough()
        }))
        const AsyncNumber = Schema.Number.pipe(Schema.decode({
          decode: SchemaGetter.transformEffect((n: number) =>
            Effect.as(Effect.sleep("20 millis"), n)
          ),
          encode: SchemaGetter.passthrough()
        }))

        const V1 = makeAsyncHost(AsyncString, "saved-parent")
        const V2Incompatible = makeAsyncHost(AsyncNumber, 99)

        const first = makeContainer("async-app")
        yield* Effect.gen(function*() {
          yield* BrowserHost.mountEffect(V1, {}, first)
          yield* Effect.sleep("10 millis")
          first.querySelector("button")!.click()
          yield* Effect.sleep("10 millis")
          assert.include(first.textContent ?? "", "field=typed")
          triggerHotSave()
        }).pipe(Effect.scoped)
        first.remove()

        const second = makeContainer("async-app")
        yield* Effect.gen(function*() {
          yield* BrowserHost.mountEffect(V1, {}, second)
          yield* Effect.sleep("50 millis")
          assert.include(second.textContent ?? "", "parent=saved-parent")
          assert.include(second.textContent ?? "", "field=typed")
          triggerHotSave()
        }).pipe(Effect.scoped)
        second.remove()

        const third = makeContainer("async-app")
        const { warnings } = yield* captureWarnings(
          Effect.gen(function*() {
            yield* BrowserHost.mountEffect(V2Incompatible, {}, third)
            yield* Effect.sleep("50 millis")
            assert.include(third.textContent ?? "", "parent=99")
            assert.include(third.textContent ?? "", "field=typed")
          }).pipe(Effect.scoped)
        )
        third.remove()
        assert.include(
          warnings.join("\n"),
          "/AsyncRoot/AsyncParent[p] restarted from init"
        )
      })
  )

  it.live(
    "does not leak stale Router history state for a child adopted from a hot snapshot onto a later route",
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

        const first = makeContainer("leak-app")
        yield* Effect.gen(function*() {
          const root = yield* BrowserHost.mountEffect(
            App,
            Router.props(AppRoute),
            first
          )
          yield* Effect.sleep("10 millis")
          first.querySelectorAll("button")[0]!.click()
          yield* Effect.sleep("10 millis")
          assert.include(first.textContent ?? "", "draft=history")
          root.send(AppMsg.Go({ route: AppRoute.Next() }))
          yield* Effect.sleep("10 millis")
          window.history.back()
          yield* Effect.sleep("20 millis")
          first.querySelectorAll("button")[1]!.click()
          yield* Effect.sleep("10 millis")
          assert.include(first.textContent ?? "", "draft=hot")
          triggerHotSave()
        }).pipe(
          Effect.scoped,
          Effect.provide(BrowserRouter.layer({ routes: AppRoute }))
        )
        first.remove()

        const second = makeContainer("leak-app")
        yield* Effect.gen(function*() {
          const root = yield* BrowserHost.mountEffect(
            App,
            Router.props(AppRoute),
            second
          )
          yield* Effect.sleep("10 millis")
          assert.include(second.textContent ?? "", "draft=hot")
          root.send(AppMsg.Toggle())
          yield* Effect.sleep("10 millis")
          root.send(AppMsg.Go({ route: AppRoute.Next() }))
          yield* Effect.sleep("10 millis")
          assert.include(second.textContent ?? "", "draft=init")
        }).pipe(
          Effect.scoped,
          Effect.provide(BrowserRouter.layer({ routes: AppRoute }))
        )
        second.remove()
      })
  )

  it.live(
    "reserves snapshots with explicit container IDs for matching containers",
    () =>
      Effect.gen(function*() {
        sessionStorage.clear()
        const Msg = UiSchema.TaggedEnum({ Inc: {} })
        const Box = Html.component({
          name: "Box",
          model: Schema.Number,
          message: Msg
        }).make({
          init: () => 0,
          update: ($) => $.model + 1,
          view: (h, count) => h.span(`box=${count}`)
        })

        const orig = makeContainer("editor-orig")
        yield* Effect.gen(function*() {
          const root = yield* BrowserHost.mountEffect(Box, {}, orig)
          root.send(Msg.Inc())
          root.send(Msg.Inc())
          yield* Effect.sleep("10 millis")
          assert.strictEqual(orig.textContent, "box=2")
          triggerHotSave()
        }).pipe(Effect.scoped)
        orig.remove()

        const other = makeContainer("editor-new")
        const anon = makeContainer()
        const restoredOrig = makeContainer("editor-orig")
        yield* Effect.gen(function*() {
          yield* BrowserHost.mountEffect(Box, {}, other)
          yield* BrowserHost.mountEffect(Box, {}, anon)
          yield* BrowserHost.mountEffect(Box, {}, restoredOrig)
          yield* Effect.sleep("10 millis")
          assert.strictEqual(other.textContent, "box=0")
          assert.strictEqual(anon.textContent, "box=0")
          assert.strictEqual(restoredOrig.textContent, "box=2")
        }).pipe(Effect.scoped)
        other.remove()
        anon.remove()
        restoredOrig.remove()
      })
  )
})
