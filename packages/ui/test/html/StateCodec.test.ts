// @vitest-environment happy-dom
import { Command, Component, Renderer, Route, Router, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Logger, Option, Schema, SchemaGetter } from "effect"

let gate = Promise.resolve()
const Label = Schema.String.pipe(Schema.decode({
  decode: SchemaGetter.transformEffect((label: string) => Effect.promise(() => gate.then(() => label))),
  encode: SchemaGetter.passthrough()
}))

const macrotask = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

const Bumped = UiSchema.TaggedEnum({ Bumped: {} })

const Upload = Component.define({
  name: "Upload",
  scoped: false,
  model: Schema.Struct({ file: Schema.Option(Schema.File), label: Label, count: Schema.Number }),
  message: Bumped,
  elements: Html
}).make({
  init: () => ({
    file: Option.some(new File(["hello"], "notes.txt", { type: "text/plain", lastModified: 1 })),
    label: "Attached",
    count: 0
  }),
  update: ($) => ({ ...$.model, count: $.model.count + 1 }),
  view: (h, model) =>
    h.el("button").on("click", Bumped.Bumped()).children(
      `${model.label} ${
        Option.match(model.file, { onNone: () => "nothing", onSome: (file) => file.name })
      } ${model.count}`
    )
})

const warnings = () => {
  const messages: Array<string> = []
  const logger = Logger.make<unknown, void>((options) => {
    if (options.logLevel === "Warn") messages.push(String(options.message))
  })
  return { messages, layer: Logger.layer([logger]) }
}

describe("state codecs", () => {
  it.effect("ships a File in a Model and adopts a Model that decodes asynchronously", () =>
    Effect.gen(function*() {
      const rendered = yield* ssr(Upload, {})
      assert.include(JSON.stringify(rendered.state["/Upload"]), "aGVsbG8=")
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("defers a Model that doesn't encode, and warns once per component with the Schema issue", () => {
    const { layer, messages } = warnings()
    const Callback = Component.define({
      name: "Callback",
      scoped: false,
      model: Schema.Struct({
        extra: Schema.Struct({ value: Schema.declare((u): u is () => void => typeof u === "function") })
      }),
      message: Schema.Never
    }).make({ init: () => ({ extra: { value: () => {} } }), update: ($) => $.model, view: (h) => h.text("") })
    return Effect.gen(function*() {
      const first = yield* Renderer.prerender(Callback, {})
      yield* Renderer.prerender(Callback, {})
      assert.deepStrictEqual(first.state["~deferred"], ["/Callback"])
      assert.strictEqual(messages.length, 1)
      assert.include(messages[0], "Callback: its state doesn't encode as JSON")
      assert.include(messages[0], "Expected JSON value\n  at [\"extra\"][\"value\"]")
    }).pipe(Effect.provide(layer))
  })

  it.effect("restores a state that encodes later from memory only, and one that decodes later once decoded", () => {
    const Routes = Route.union({ Upload: Route.make("/"), Other: Route.make("/other") })
    const Message = UiSchema.TaggedEnum({ ChangedRoute: { route: Routes }, Go: {}, Went: {} })
    const App = Component.define({
      name: "App",
      scoped: false,
      props: Schema.Struct({ route: Routes }),
      model: Routes,
      message: Message,
      elements: Html
    }).make({
      init: ($) => $.props.route,
      update: ($, message) =>
        Message.match(message, {
          ChangedRoute: (changed) => changed.route,
          Go: () => $.run(Router.push(Routes, Routes.Other()).pipe(Command.map(() => Message.Went()))),
          Went: () => $.model
        }),
      subscriptions: (
        { model: route }
      ) => [Router.subscription(Routes, route, (route) => Message.ChangedRoute({ route }))],
      view: (h, route) =>
        h.el(
          "div",
          h.el("a").on("click", Message.Go()).children("Other"),
          route._tag === "Upload" ? Upload(h, { key: "upload" }) : h.text("Other page")
        )
    })
    const history = Router.memoryHistory("/")
    const { layer, messages } = warnings()
    const mount = Effect.gen(function*() {
      const root = yield* TestHost.mount(App, Router.props(Routes))
      yield* TestHost.settle
      return root
    })
    const page = <A, E, R>(self: Effect.Effect<A, E, R>) =>
      self.pipe(
        Effect.scoped,
        Effect.provide(Router.make({ routes: Routes, history })),
        Effect.provide(TestHost.layer())
      )
    const click = (root: TestHost.TestRoot<any, any, any>, text: string) =>
      Locator.fire(root.get(Locator.text(text)), "click")
    return Effect.gen(function*() {
      yield* Effect.gen(function*() {
        const root = yield* mount
        click(root, "Attached notes.txt 0")
        yield* TestHost.settle
        click(root, "Other")
        yield* TestHost.settle
        yield* macrotask
        let open!: () => void
        gate = new Promise((resolve) => open = resolve)
        history.go(-1)
        yield* TestHost.settle
        assert.strictEqual(root.text(), "Other")
        open()
        yield* macrotask
        yield* TestHost.settle
        assert.strictEqual(root.text(), "OtherAttached notes.txt 1")
        history.go(1)
        yield* TestHost.settle
      }).pipe(page)
      yield* Effect.gen(function*() {
        const root = yield* mount
        history.go(-1)
        yield* TestHost.settle
        assert.strictEqual(root.text(), "OtherAttached notes.txt 0")
      }).pipe(page)
      assert.deepStrictEqual(messages, [
        "Upload: its state encodes asynchronously, so history keeps it in memory only. Back and forward restore it, and after a reload it starts from init."
      ])
    }).pipe(Effect.provide(layer))
  })
})
