// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Collapsible } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, container, tick } from "./utils/document.ts"

const Config = Schema.Struct({
  hiddenUntilFound: Schema.Boolean,
  refuse: Schema.Boolean,
  disabled: Schema.Boolean,
  style: Schema.optional(Schema.String)
})
type Config = typeof Config.Type

const Message = UiSchema.TaggedEnum({
  Toggled: { open: Schema.Boolean, reason: Schema.String },
  Settled: { open: Schema.Boolean }
})

const Page = Component.define({
  name: "Page",
  scoped: false,
  props: Config,
  model: Schema.Struct({ config: Config, open: Schema.Boolean, log: Schema.Array(Schema.String) }),
  message: Message,
  elements: Html
}).make({
  init: ($) => ({ config: $.props, open: false, log: [] }),
  update: {
    Toggled: (model, { open, reason }) => ({
      ...model,
      open: model.config.refuse ? model.open : open,
      log: [...model.log, `Toggled ${open} ${reason}`]
    }),
    Settled: (model, { open }) => ({ ...model, log: [...model.log, `Settled ${open}`] })
  },
  view: (model, h) =>
    Collapsible(h, {
      props: { open: model.open, hiddenUntilFound: model.config.hiddenUntilFound, disabled: model.config.disabled },
      onEmit: {
        Toggled: ({ open, reason }) => Message.Toggled({ open, reason }),
        Settled: ({ open }) => Message.Settled({ open })
      },
      view: (collapsible) =>
        collapsible.root(h.div).children(
          collapsible.trigger(h.button.attr("id", "trigger")).children("Details"),
          collapsible.panel(h.div.attr("id", "panel").attr("style", model.config.style))?.children(
            "Content",
            h.div.attr("id", "child")
          )
        )
    })
})

const layout = Effect.acquireRelease(
  Effect.sync(() => {
    const proto = window.HTMLElement.prototype
    const sized = (value: number) =>
      function(this: HTMLElement) {
        return this.id === "panel" ? value : 0
      }
    Object.defineProperty(proto, "scrollHeight", { configurable: true, get: sized(120) })
    Object.defineProperty(proto, "scrollWidth", { configurable: true, get: sized(200) })
  }),
  () =>
    Effect.sync(() => {
      delete (window.HTMLElement.prototype as { scrollHeight?: number }).scrollHeight
      delete (window.HTMLElement.prototype as { scrollWidth?: number }).scrollWidth
    })
)

const animations = Effect.acquireRelease(
  Effect.sync(() => {
    const original = Element.prototype.getAnimations
    let finish = () => {}
    const running = () =>
      ({
        effect: { getComputedTiming: () => ({ endTime: 200 }) },
        finished: new Promise<void>((resolve) => (finish = resolve))
      }) as unknown as Animation
    let current: Animation | undefined
    Element.prototype.getAnimations = function(this: Element) {
      if (this.id !== "panel") return []
      current ??= running()
      return [current]
    }
    return {
      original,
      finish: () => {
        finish()
        current = undefined
      }
    }
  }),
  ({ original }) => Effect.sync(() => (Element.prototype.getAnimations = original))
)

const frames = Effect.acquireRelease(
  Effect.sync(() => {
    const original = window.requestAnimationFrame
    let queued: Array<FrameRequestCallback> = []
    window.requestAnimationFrame = (f) => {
      queued.push(f)
      return queued.length
    }
    return {
      original,
      next: Effect.gen(function*() {
        const run = queued
        queued = []
        for (const f of run) f(performance.now())
        yield* tick
      })
    }
  }),
  ({ original }) => Effect.sync(() => (window.requestAnimationFrame = original))
)

const record = (target: () => Element | null) => {
  const seen: Array<string> = []
  const observer = new MutationObserver(() => {
    const panel = target()
    const line = panel === null
      ? "gone"
      : [
        panel.hasAttribute("data-starting-style") ? "starting" : "",
        panel.hasAttribute("data-ending-style") ? "ending" : "",
        panel.hasAttribute("hidden") ? "hidden" : "",
        /--collapsible-panel-height:\s*(\d+px|auto)/.exec(panel.getAttribute("style") ?? "")?.[1] ?? ""
      ].filter((part) => part !== "").join(" ")
    if (seen.at(-1) !== line) seen.push(line)
  })
  observer.observe(document.body, { subtree: true, childList: true, attributes: true })
  return { seen, stop: () => observer.disconnect() }
}

const mountPage = Effect.fnUntraced(function*(overrides: Partial<Config> = {}) {
  yield* layout
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(
    Page,
    { hiddenUntilFound: false, refuse: false, disabled: false, ...overrides },
    app
  )
  yield* tick
  return { log: () => root.model()!.log }
})

describe("Collapsible in a document", { concurrent: false }, () => {
  it.effect("an open runs from the measured size, and a close writes it before the ending style", () =>
    Effect.gen(function*() {
      const { finish } = yield* animations
      const { log } = yield* mountPage()
      const { seen, stop } = record(() => document.getElementById("panel"))
      byId("trigger").click()
      yield* tick
      yield* tick
      assert.deepStrictEqual(seen, ["starting auto", "starting 120px", "120px"])
      finish()
      yield* tick
      assert.deepStrictEqual(seen.at(-1), "auto")
      assert.deepStrictEqual(log(), ["Toggled true trigger-press", "Settled true"])

      seen.length = 0
      byId("trigger").click()
      yield* tick
      yield* tick
      assert.deepStrictEqual(seen, ["auto", "120px", "ending 120px"])
      finish()
      yield* tick
      stop()
      assert.deepStrictEqual(seen.at(-1), "gone")
      assert.deepStrictEqual(log().slice(2), ["Toggled false trigger-press", "Settled false"])
    }))

  it.effect("a close interrupted by an open and another close waits two frames from the last close", () =>
    Effect.gen(function*() {
      const { finish } = yield* animations
      const { next } = yield* frames
      yield* mountPage()
      const panel = () => byId("panel")
      byId("trigger").click()
      yield* tick
      yield* next
      yield* next
      finish()
      yield* tick

      byId("trigger").click()
      yield* tick
      yield* next
      byId("trigger").click()
      yield* tick
      byId("trigger").click()
      yield* tick
      yield* next
      assert.isFalse(panel().hasAttribute("data-ending-style"))
      yield* next
      assert.isTrue(panel().hasAttribute("data-ending-style"))
    }))

  it.effect("a close measuring the same size keeps the consumer's important alignment", () =>
    Effect.gen(function*() {
      yield* animations
      yield* mountPage({ style: "justify-content:flex-end !important" })
      byId("trigger").click()
      yield* tick
      yield* tick
      byId("trigger").click()
      yield* tick
      assert.strictEqual(byId("panel").style.getPropertyValue("justify-content"), "flex-end")
      assert.strictEqual(byId("panel").style.getPropertyPriority("justify-content"), "important")
    }))

  it.effect("a match bubbling from inside the panel is not the panel's own", () =>
    Effect.gen(function*() {
      yield* animations
      const { log } = yield* mountPage()
      byId("trigger").click()
      yield* tick
      yield* tick
      byId("trigger").click()
      yield* tick
      yield* tick
      const panel = byId("panel")
      assert.isTrue(panel.hasAttribute("data-ending-style"))
      byId("child").dispatchEvent(new Event("beforematch", { bubbles: true }))
      yield* tick
      yield* tick
      assert.deepStrictEqual(log(), ["Toggled true trigger-press", "Toggled false trigger-press"])
      assert.isTrue(panel.hasAttribute("data-ending-style"))
    }))

  it.effect("a match bubbling from inside a panel hidden until found waits for the panel's own", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ hiddenUntilFound: true })
      const panel = byId("panel")
      byId("child").dispatchEvent(new Event("beforematch", { bubbles: true }))
      yield* tick
      assert.deepStrictEqual(log(), [])
      assert.isTrue(panel.hasAttribute("data-starting-style"))
      panel.dispatchEvent(new Event("beforematch", { bubbles: true }))
      panel.removeAttribute("hidden")
      yield* tick
      yield* tick
      assert.deepStrictEqual(log(), ["Toggled true find-in-page", "Settled true"])
    }))

  it.effect("a find-in-page match opens the panel at once", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ hiddenUntilFound: true })
      const panel = byId("panel")
      assert.strictEqual(panel.getAttribute("hidden"), "until-found")
      assert.isTrue(panel.hasAttribute("data-starting-style"))
      panel.dispatchEvent(new Event("beforematch", { bubbles: true }))
      panel.removeAttribute("hidden")
      assert.isFalse(panel.hasAttribute("data-starting-style"))
      yield* tick
      yield* tick
      assert.deepStrictEqual(log(), ["Toggled true find-in-page", "Settled true"])
      assert.isFalse(panel.hasAttribute("hidden"))
      assert.isFalse(panel.hasAttribute("data-starting-style"))
      assert.notInclude(panel.getAttribute("style") ?? "", "duration")
    }))

  it.effect("a refused or disabled reveal puts the panel back to hidden until found", () =>
    Effect.gen(function*() {
      for (const config of [{ refuse: true }, { disabled: true }]) {
        yield* Effect.scoped(Effect.gen(function*() {
          const { log } = yield* mountPage({ hiddenUntilFound: true, ...config })
          const panel = byId("panel")
          panel.dispatchEvent(new Event("beforematch", { bubbles: true }))
          panel.removeAttribute("hidden")
          yield* tick
          yield* tick
          assert.deepStrictEqual(log(), config.refuse ? ["Toggled true find-in-page"] : [])
          assert.strictEqual(panel.getAttribute("hidden"), "until-found")
          assert.isTrue(panel.hasAttribute("data-starting-style"))
          assert.notInclude(panel.getAttribute("style") ?? "", "duration")
        }))
      }
    }))

  it.effect("matches that overlap and are refused restore the closed panel's starting style", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ hiddenUntilFound: true, refuse: true })
      const panel = byId("panel")
      panel.dispatchEvent(new Event("beforematch", { bubbles: true }))
      panel.dispatchEvent(new Event("beforematch", { bubbles: true }))
      panel.removeAttribute("hidden")
      yield* tick
      yield* tick
      assert.deepStrictEqual(log(), ["Toggled true find-in-page", "Toggled true find-in-page"])
      assert.strictEqual(panel.getAttribute("hidden"), "until-found")
      assert.isTrue(panel.hasAttribute("data-starting-style"))
    }))
})
