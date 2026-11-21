// @vitest-environment happy-dom
import { Component, Feature, MessageLog, UiSchema, type View } from "@effect/ui"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import * as replay from "@effect/ui/internal/replay"
import { Story } from "@effect/ui/testing"
import { expect, it } from "@effect/vitest"
import { Cause, type Duration, Effect, Fiber, Layer, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { TestClock } from "effect/testing"
import { describe } from "vitest"

class Editor extends Feature.Service<Editor>()("SlotStatus/HtmlEditor", { props: Schema.Struct({}) }) {}
const EditorView = Component.define({
  name: "EditorView",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
})
  .make({
    init: () => null,
    update: (model) => model,
    view: (_, h) => h.p("editor")
  })
// The failure branch shows its cause, stack included, so the server and the client must pass the same one.
const shown = (result: AsyncResult.AsyncResult<never, unknown>) =>
  AsyncResult.isFailure(result) ? Cause.pretty(result.cause) : "loading"

const Message = UiSchema.TaggedEnum({ Failed: {} })
const Page = Component.define({ name: "Page", scoped: false, model: Schema.String, message: Message, elements: Html })
  .make({
    init: () => "fine",
    update: () => "failed",
    view: (_, h) => h.div(Editor.render(h, { key: "e", props: {}, fallback: (result) => h.p(shown(result)) }))
  })
const slot = "/Page/SlotStatus/HtmlEditor[e]"

/** The text a view shows. */
const textOf = (node: View.Node<any, any>): string =>
  node._tag === "Text" ? node.text : node._tag === "Element" ? node.children.map(textOf).join("") : ""

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

/** Renders `component` on the server, letting `elapsed` pass, then mounts it over the markup. Each side has a log. */
const hydrate = Effect.fnUntraced(
  function*(component: Component.Provided<typeof Page, Editor, never>, elapsed: Duration.Input) {
    const serverLog = MessageLog.makeMemory({ size: 1000 })
    const fiber = yield* Effect.forkChild(
      HtmlServer.renderToHtml(component, {}, { budget: "50 millis" }).pipe(
        Effect.provideService(MessageLog.MessageLog, serverLog)
      )
    )
    yield* TestClock.adjust(elapsed)
    const rendered = yield* Fiber.join(fiber)
    const app = yield* container(rendered.html)
    const before = app.querySelector("p")!
    const log = MessageLog.makeMemory({ size: 1000 })
    yield* BrowserHost.mountEffect(component, {}, app, { state: rendered.state }).pipe(
      Effect.provideService(MessageLog.MessageLog, log)
    )
    yield* tick
    return { rendered, app, before, log, serverLog }
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
    }).pipe(Effect.scoped))

  it.effect("a slot whose Layer failed on the server ships Failed, and the client adopts its failure branch, cause included", () =>
    Effect.gen(function*() {
      let builds = 0
      const handled: Array<unknown> = []
      const Broken = Component.provide(
        Page,
        Editor.toLayer(EditorView).pipe(
          Layer.provide(Layer.effectDiscard(Effect.suspend(() => {
            builds++
            return Effect.fail("offline")
          })))
        ),
        {
          onFailure: (result: AsyncResult.Failure<never, string>) => {
            handled.push(Cause.squash(result.cause))
            return Message.Failed()
          }
        }
      )
      const { app, before, log, rendered, serverLog } = yield* hydrate(Broken, "0 millis")
      // The server's cause isn't in the page, nor is a stack: both sides pass the fallback the same redacted one.
      expect(rendered.html).not.toContain("offline")
      expect(rendered.html).not.toMatch(/\sat .*:\d+:\d+/)
      expect(rendered.html).toContain("<p>Error: [@effect/ui] A provided Layer failed on the server</p>")
      expect(rendered.state["~deferred"]).toEqual([])
      expect(rendered.state["~status"]).toEqual({ "/Page": "Failed", [slot]: "Failed" })
      expect(rendered.state["/Page"]).toBe("failed")
      // The server's handler got the original cause. The client, adopting the failure, doesn't run it.
      expect(handled).toEqual(["offline"])
      // The server built it once. The client adopts the failure without building it again.
      expect(builds).toBe(1)
      expect(app.querySelector("p")).toBe(before)
      expect(app.textContent).toBe("Error: [@effect/ui] A provided Layer failed on the server")
      // The server's log keeps the cause the handler got, and says the slots didn't get it, so a view
      // replayed from it shows what the page did.
      const failed = serverLog.entries().filter((entry) => entry._tag === "LayerFailed")
      expect(failed.map((entry) => [entry.redacted, Cause.squash(entry.cause)])).toEqual([[true, "offline"]])
      const encode = MessageLog.makeEncoder().encode
      // The client's frame says so too: a Wire replay passes the slots the substitute, not a defect decoded from JSON.
      expect(log.entries().map(encode).flatMap((frame) => frame._tag === "LayerFailed" ? [frame.redacted] : []))
        .toEqual([true])
      for (const entries of [serverLog.entries(), log.entries().map(encode)]) {
        expect(textOf(replay.viewOf(Story.fromLog(Broken, entries)))).toBe(
          "Error: [@effect/ui] A provided Layer failed on the server"
        )
      }
    }).pipe(Effect.scoped))

  it.effect("a slot the server rendered whose client Layer isn't ready reports that it awaits the client's Layer", () =>
    Effect.gen(function*() {
      const Timed = Component.provide(
        Page,
        Editor.toLayer(EditorView).pipe(Layer.provide(Layer.effectDiscard(Effect.sleep("30 millis"))))
      )
      const { app, before, log, rendered } = yield* hydrate(Timed, "30 millis")
      expect(rendered.html).toContain("<p>editor</p>")
      expect(log.entries().flatMap((entry) => entry._tag === "LayerPending" ? [entry.status] : [])).toEqual([
        "Awaiting"
      ])
      expect(app.querySelector("p")).toBe(before)
    }).pipe(Effect.scoped))
})
