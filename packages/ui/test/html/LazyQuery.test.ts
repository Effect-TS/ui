// @vitest-environment happy-dom
import { assert, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { vi } from "vitest"

/** Lets the render flush and the fetch settle. */
const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))

const container = Effect.acquireRelease(
  Effect.sync(() => document.body.appendChild(document.createElement("div"))),
  (element) => Effect.sync(() => element.remove())
)

it.effect("a root mounted before the app imports Query runs the queries of a child that loads later", () =>
  Effect.gen(function*() {
    // A module graph of its own, as in an app whose entry chunk has no query: nothing has imported Query.
    vi.resetModules()
    const [Component, UiSchema, BrowserHost, Html] = yield* Effect.promise(() =>
      Promise.all([
        import("@effect/ui/Component"),
        import("@effect/ui/UiSchema"),
        import("@effect/ui/html/BrowserHost"),
        import("@effect/ui/html/Html")
      ])
    )
    let child: ((h: any) => any) | undefined
    const Message = UiSchema.TaggedEnum({ Opened: {} })
    const App = Component.define({ name: "App", model: Schema.Boolean, message: Message, elements: Html }).make({
      init: () => false,
      update: () => true,
      view: (open, h) =>
        h.div.children(
          h.button.onClick(Message.Opened()).children("Open"),
          open && child !== undefined ? child(h) : h.p.children("closed")
        )
    })
    const app = yield* container
    yield* BrowserHost.mountEffect(App, {}, app)
    assert.strictEqual(app.querySelector("p")?.textContent, "closed")

    // The lazy chunk: it imports Query, and defines a query and the component that reads it.
    const Query = yield* Effect.promise(() => import("@effect/ui/Query"))
    class GetNote extends Query.Service<GetNote>()(
      "lazy/GetNote",
      { args: { id: Schema.String }, success: Schema.String, error: Schema.Never, staleTime: "30 seconds" },
      Effect.succeed(({ id }) => Effect.succeed(`Note ${id}`))
    ) {}
    const Note = Component.define({
      name: "Note",
      model: Schema.Null,
      message: Schema.Never,
      elements: Html,
      queries: { note: { query: GetNote, args: () => ({ id: "1" }) } }
    }).make({
      init: () => null,
      update: (model) => model,
      view: (_model, h) =>
        h.p.children(AsyncResult.match(h.queries.note, {
          onInitial: () => "loading",
          onFailure: () => "failed",
          onSuccess: (success) => success.value
        }))
    }).pipe(Component.provide(GetNote.layer))
    child = (h) => Note(h, {})

    app.querySelector("button")!.click()
    yield* tick
    assert.strictEqual(app.querySelector("p")?.textContent, "Note 1")
  }))
