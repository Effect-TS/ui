// @vitest-environment happy-dom
import { Command, Component, Route, Router, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Schema, SchemaGetter } from "effect"

const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

class Slow extends Context.Service<Slow, string>()("test/Slow") {}
let gate: Effect.Effect<void> = Effect.void
const slow = Layer.effect(Slow, Effect.suspend(() => Effect.as(gate, "ready")))

let inits = 0
const form = (name: string) =>
  Component.define({ name, scoped: false, model: Schema.String, message: Schema.String, elements: Html }).make({
    init: () => inits++ === 0 ? "server" : "client",
    update: (_, text) => text,
    view: (text, h) => h.input.value(text).onInput(({ value }) => value)
  })
const Form = form("Form")
const SlowForm = form("SlowForm").pipe(Component.provide(slow))
const SlowSide = Component.define({
  name: "SlowSide",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({ init: () => null, update: (model) => model, view: (_, h) => h.i("side") }).pipe(Component.provide(slow))

const Late = Schema.String.pipe(Schema.decode({
  decode: SchemaGetter.transformEffect((text: string) => Effect.as(Effect.suspend(() => gate), text)),
  encode: SchemaGetter.passthrough()
}))
const LateForm = Component.define({
  name: "LateForm",
  scoped: false,
  model: Late,
  message: Schema.String,
  elements: Html
}).make({
  init: () => "client",
  update: (_, text) => text,
  view: (text, h) => h.input.value(text).onInput(({ value }) => value)
})
const ScopedForm = Component.define({
  name: "ScopedForm",
  scoped: true,
  model: Schema.String,
  message: Schema.String,
  elements: Html
}).make({
  init: () => inits++ === 0 ? "server" : "client",
  update: (_, text) => text,
  view: (text, h) => h.input.value(text)
}).pipe(Component.provide(slow))
const Holder = Component.define({
  name: "Holder",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.scoped((s) => h.div(ScopedForm(s, { key: "d" })))
})

type Page = "slow form" | "slow side" | "late form" | "scoped form"
const Routes = Route.union({ Home: Route.make("/"), Away: Route.make("/away") })
const Msg = UiSchema.TaggedEnum({ Changed: { route: Routes }, Go: {}, Went: {} })
const appOf = (page: Page) =>
  Component.define({
    name: "App",
    scoped: false,
    props: Schema.Struct({ route: Routes }),
    model: Routes,
    message: Msg,
    elements: Html
  }).make({
    init: ($) => $.props.route,
    update: (route, message, $) =>
      Msg.match(message, {
        Changed: (changed) => changed.route,
        Go: () => $.run(Router.push(Routes, Routes.Away()).pipe(Command.map(() => Msg.Went()))),
        Went: () => route
      }),
    subscriptions: (route) => [Router.subscription(Routes, route, (changed) => Msg.Changed({ route: changed }))],
    view: (route, h) =>
      h.main(
        page === "slow side" ? SlowSide(h, { key: "s" }) : null,
        route._tag === "Away"
          ? h.p("away")
          : page === "slow side"
          ? Form(h, { key: "f" })
          : page === "late form"
          ? LateForm(h, { key: "f" })
          : page === "scoped form"
          ? Holder(h, { key: "f" })
          : SlowForm(h, { key: "f" })
      )
  })

const visit = Effect.fnUntraced(function*(page: Page) {
  inits = 0
  gate = Effect.void
  const App = appOf(page)
  const props = Router.props(Routes)
  const { html, state } = yield* HtmlServer.renderToHtml(App, props).pipe(
    Effect.provide(Router.make({ routes: Routes, history: Router.memoryHistory("/") }))
  )
  const latch = yield* Deferred.make<void>()
  gate = Deferred.await(latch)
  const app = document.body.appendChild(document.createElement("div"))
  yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
  app.innerHTML = html
  const root = yield* BrowserHost.mountEffect(App, props, app, { state })
  yield* tick
  return { app, root, open: Deferred.succeed(latch, undefined) }
})

describe("history restore of a page whose hydration hasn't settled", () => {
  it.effect.each(["slow form", "scoped form"] as const)(
    "Back restores the server's Model of a %s a push closed as it waited for its Layer",
    (page) => {
      const history = Router.memoryHistory("/")
      return Effect.gen(function*() {
        const { app, open, root } = yield* visit(page)
        root.send(Msg.Go())
        yield* tick
        yield* open
        history.go(-1)
        yield* tick
        assert.strictEqual(app.querySelector("input")!.value, "server")
      }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
    }
  )

  it.effect("Back restores what the user typed in a form a push closed as an earlier Back's state decoded", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, open, root } = yield* visit("late form")
      yield* open
      yield* tick
      const field = app.querySelector("input")!
      field.value = "typed"
      field.dispatchEvent(new Event("input", { bubbles: true }))
      yield* tick
      root.send(Msg.Go())
      yield* tick
      const latch = yield* Deferred.make<void>()
      gate = Deferred.await(latch)
      history.go(-1)
      yield* tick
      root.send(Msg.Go())
      yield* tick
      yield* Deferred.succeed(latch, undefined)
      history.go(-1)
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "typed")
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })

  it.effect("Back restores what the user typed, over the server's Model, while another component waits", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, root } = yield* visit("slow side")
      const field = app.querySelector("input")!
      field.value = "typed"
      field.dispatchEvent(new Event("input", { bubbles: true }))
      yield* tick
      root.send(Msg.Go())
      yield* tick
      history.go(-1)
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "typed")
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })
})
