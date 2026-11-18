// @vitest-environment happy-dom
import { Component, Feature, MessageLog, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { expect, it } from "@effect/vitest"
import { type Duration, Effect, Fiber, Layer, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { TestClock } from "effect/testing"
import { describe } from "vitest"

class Editor extends Feature.Service<Editor>()("SlotStatus/HtmlEditor", { props: Schema.Struct({}) }) {}
const EditorView = Component.define({ name: "EditorView", model: Schema.Null, message: Schema.Never, elements: Html })
  .make({
    init: () => null,
    update: (model) => model,
    view: (_, h) => h.p("editor")
  })
const shown = (result: AsyncResult.AsyncResult<never, unknown>) => AsyncResult.isFailure(result) ? "down" : "loading"

const Message = UiSchema.TaggedEnum({ Failed: {} })
const Page = Component.define({ name: "Page", model: Schema.String, message: Message, elements: Html }).make({
  init: () => "fine",
  update: () => "failed",
  view: (_, h) => h.div(Editor.render(h, { key: "e", props: {}, fallback: (result) => h.p(shown(result)) }))
})
const slot = "/Page/SlotStatus/HtmlEditor[e]"

const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))
const container = (html: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const element = document.body.appendChild(document.createElement("div"))
      element.innerHTML = html
      return element
    }),
    (element) => Effect.sync(() => element.remove())
  )

/** Renders `component` on the server, letting `elapsed` pass, then mounts it over the markup with a log. */
const hydrate = Effect.fnUntraced(
  function*(component: Component.Provided<typeof Page, Editor, never>, elapsed: Duration.Input) {
    const fiber = yield* Effect.forkChild(HtmlServer.renderToHtml(component, {}, { budget: "50 millis" }))
    yield* TestClock.adjust(elapsed)
    const rendered = yield* Fiber.join(fiber)
    const app = yield* container(rendered.html)
    const before = app.querySelector("p")!
    const log = MessageLog.makeMemory({ size: 1000 })
    yield* BrowserHost.mountEffect(component, {}, app, { state: rendered.state }).pipe(
      Effect.provideService(MessageLog.MessageLog, log)
    )
    yield* tick
    return { rendered, app, before, log }
  }
)

describe("slot status after SSR", { concurrent: false }, () => {
  it.effect("a slot pending on the server keeps the server's fallback nodes, and isn't deferred", () =>
    Effect.gen(function*() {
      const Slow = Component.provide(
        Page,
        Editor.toLayer(EditorView).pipe(Layer.provide(Layer.effectDiscard(Effect.sleep("300 millis"))))
      )
      const { app, before, rendered } = yield* hydrate(Slow, "50 millis")
      expect(rendered.html).toContain("<p>loading</p>")
      expect(rendered.state["~deferred"]).toEqual([])
      expect(rendered.state["~status"]).toEqual({ "/Page": "Pending", [slot]: "Pending" })
      expect(app.querySelector("p")).toBe(before)
      expect(app.textContent).toBe("loading")
      yield* TestClock.adjust("300 millis")
      yield* tick
      expect(app.textContent).toBe("editor")
    }).pipe(Effect.scoped))

  it.effect("a slot whose Layer failed on the server ships Failed, and the client adopts its failure branch", () =>
    Effect.gen(function*() {
      let builds = 0
      const Broken = Component.provide(
        Page,
        Editor.toLayer(EditorView).pipe(
          Layer.provide(Layer.effectDiscard(Effect.suspend(() => {
            builds++
            return Effect.fail("offline")
          })))
        ),
        { onFailure: () => Message.Failed() }
      )
      const { app, before, log, rendered } = yield* hydrate(Broken, "0 millis")
      expect(rendered.html).toContain("<p>down</p>")
      expect(rendered.state["~deferred"]).toEqual([])
      expect(rendered.state["~status"]).toEqual({ "/Page": "Failed", [slot]: "Failed" })
      expect(rendered.state["/Page"]).toBe("failed")
      // The server built it once. The client adopts the failure without building it again.
      expect(builds).toBe(1)
      expect(app.querySelector("p")).toBe(before)
      expect(app.textContent).toBe("down")
      expect(log.entries().filter((entry) => entry._tag === "LayerFailed").map((entry) => entry.path)).toEqual([
        "/Page"
      ])
    }).pipe(Effect.scoped))

  it.effect("a slot the server rendered whose client Layer isn't ready reports that it awaits the client's Layer", () =>
    Effect.gen(function*() {
      const Timed = Component.provide(
        Page,
        Editor.toLayer(EditorView).pipe(Layer.provide(Layer.effectDiscard(Effect.sleep("30 millis"))))
      )
      const { app, before, log, rendered } = yield* hydrate(Timed, "30 millis")
      expect(rendered.html).toContain("<p>editor</p>")
      expect(rendered.state["~status"]).toBeUndefined()
      expect(log.entries().flatMap((entry) => entry._tag === "LayerPending" ? [entry.status] : [])).toEqual([
        "Awaiting"
      ])
      expect(app.querySelector("p")).toBe(before)
      yield* TestClock.adjust("30 millis")
      yield* tick
      expect(app.querySelector("p")).toBe(before)
      expect(app.textContent).toBe("editor")
    }).pipe(Effect.scoped))
})
