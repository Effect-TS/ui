// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Collapsible } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, container, tick } from "./utils/document.ts"

const PageProps = Schema.Struct({
  initialOpen: Schema.Boolean,
  hiddenUntilFound: Schema.Boolean,
  refuse: Schema.Boolean,
  disabled: Schema.Boolean,
  holdExit: Schema.Boolean,
  style: Schema.optional(Schema.String)
})
type PageProps = typeof PageProps.Type

const PageMessage = UiSchema.TaggedEnum({
  Toggled: { open: Schema.Boolean, reason: Schema.String },
  Settled: { open: Schema.Boolean },
  ReleaseHold: {}
})

const Page = Html.component({
  name: "Page",
  props: PageProps,
  model: Schema.Struct({
    config: PageProps,
    open: Schema.Boolean,
    holdExit: Schema.Boolean,
    log: Schema.Array(Schema.String)
  }),
  message: PageMessage
}).make({
  init: ($) => ({
    config: $.props,
    open: $.props.initialOpen,
    holdExit: $.props.holdExit,
    log: []
  }),
  update: {
    Toggled: ($, { open, reason }) => ({
      ...$.model,
      open: $.model.config.refuse ? $.model.open : open,
      log: [...$.model.log, `Toggled ${open} ${reason}`]
    }),
    Settled: ($, { open }) => ({
      ...$.model,
      log: [...$.model.log, `Settled ${open}`]
    }),
    ReleaseHold: ($) => ({ ...$.model, holdExit: false })
  },
  view: (h, model) =>
    Collapsible(h, {
      props: {
        open: model.open,
        hiddenUntilFound: model.config.hiddenUntilFound,
        disabled: model.config.disabled,
        holdExit: model.holdExit
      },
      onEmit: {
        Toggled: ({ open, reason }) => PageMessage.Toggled({ open, reason }),
        Settled: ({ open }) => PageMessage.Settled({ open })
      },
      view: (collapsible) =>
        collapsible.root(h.div.attr("id", "root")).children(
          collapsible.trigger(h.button.attr("id", "trigger")).children(
            "Details"
          ),
          h.button.attr("id", "release").on("click", PageMessage.ReleaseHold())
            .children("Release"),
          collapsible.panel(
            h.div.attr("id", "panel").attr("style", model.config.style)
          )?.children(
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
    Object.defineProperty(proto, "scrollHeight", {
      configurable: true,
      get: sized(120)
    })
    Object.defineProperty(proto, "scrollWidth", {
      configurable: true,
      get: sized(200)
    })
  }),
  () =>
    Effect.sync(() => {
      delete (window.HTMLElement.prototype as { scrollHeight?: number })
        .scrollHeight
      delete (window.HTMLElement.prototype as { scrollWidth?: number })
        .scrollWidth
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
  ({ original }) =>
    Effect.sync(() => (Element.prototype.getAnimations = original))
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
        /--collapsible-panel-height:\s*(\d+px|auto)/.exec(
          panel.getAttribute("style") ?? ""
        )?.[1] ?? ""
      ].filter((part) => part !== "").join(" ")
    if (seen.at(-1) !== line) seen.push(line)
  })
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true
  })
  return { seen, stop: () => observer.disconnect() }
}

const mountPage = Effect.fnUntraced(
  function*(overrides: Partial<PageProps> = {}) {
    yield* layout
    const app = yield* container
    const root = yield* BrowserHost.mountEffect(
      Page,
      {
        initialOpen: false,
        hiddenUntilFound: false,
        refuse: false,
        disabled: false,
        holdExit: false,
        ...overrides
      },
      app
    )
    yield* tick
    return { log: () => root.model()!.log }
  }
)

describe("Collapsible in a document", { concurrent: false }, () => {
  it.effect("opens and closes with measured sizes, respects holdExit, and starts settled when open on load", () =>
    Effect.gen(function*() {
      const { finish } = yield* animations
      const { log } = yield* mountPage({ holdExit: true })
      const { seen, stop } = record(() => document.getElementById("panel"))

      byId("trigger").click()
      yield* tick
      yield* tick
      assert.deepStrictEqual(seen, ["starting auto", "starting 120px", "120px"])
      assert.include(
        byId("panel").getAttribute("style") ?? "",
        "--collapsible-panel-width:200px"
      )
      finish()
      yield* tick
      assert.strictEqual(seen.at(-1), "auto")
      assert.deepStrictEqual(log(), [
        "Toggled true trigger-press",
        "Settled true"
      ])

      seen.length = 0
      byId("trigger").click()
      yield* tick
      yield* tick
      assert.deepStrictEqual(seen, ["auto", "120px", "ending 120px"])
      assert.isTrue(byId("root").hasAttribute("data-ending-style"))
      assert.isTrue(byId("trigger").hasAttribute("data-ending-style"))

      finish()
      yield* tick
      assert.isNotNull(document.getElementById("panel"))
      assert.deepStrictEqual(log(), [
        "Toggled true trigger-press",
        "Settled true",
        "Toggled false trigger-press"
      ])

      byId("release").click()
      yield* tick
      finish()
      yield* tick
      stop()
      assert.strictEqual(seen.at(-1), "gone")
      assert.deepStrictEqual(log().slice(2), [
        "Toggled false trigger-press",
        "Settled false"
      ])

      yield* Effect.scoped(Effect.gen(function*() {
        const opened = yield* mountPage({
          initialOpen: true,
          style: "animation-name:slide-in"
        })
        const panel = byId("panel")
        assert.isFalse(panel.hasAttribute("data-starting-style"))
        assert.strictEqual(panel.style.animationName, "none")
        assert.include(
          panel.getAttribute("style") ?? "",
          "--collapsible-panel-height:auto"
        )
        assert.deepStrictEqual(opened.log(), [])
      }))
    }))

  it.effect("an interrupted close waits two frames from the last close and keeps important alignment", () =>
    Effect.gen(function*() {
      const { finish } = yield* animations
      const { next } = yield* frames
      yield* mountPage({ style: "justify-content:flex-end !important" })
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
      assert.strictEqual(
        panel().style.getPropertyValue("justify-content"),
        "flex-end"
      )
      assert.strictEqual(
        panel().style.getPropertyPriority("justify-content"),
        "important"
      )

      yield* next
      assert.isTrue(panel().hasAttribute("data-ending-style"))
    }))

  it.effect("ignores bubbled child matches and opens immediately on the panel's own match", () =>
    Effect.gen(function*() {
      yield* Effect.scoped(Effect.gen(function*() {
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
        assert.deepStrictEqual(log(), [
          "Toggled true trigger-press",
          "Toggled false trigger-press"
        ])
        assert.isTrue(panel.hasAttribute("data-ending-style"))
      }))

      const { finish } = yield* animations
      const { log } = yield* mountPage({
        hiddenUntilFound: true,
        style: "transition-duration:150ms;animation-duration:150ms"
      })
      const panel = byId("panel")
      assert.strictEqual(panel.getAttribute("hidden"), "until-found")
      assert.isTrue(panel.hasAttribute("data-starting-style"))

      byId("child").dispatchEvent(new Event("beforematch", { bubbles: true }))
      yield* tick
      assert.deepStrictEqual(log(), [])
      assert.isTrue(panel.hasAttribute("data-starting-style"))

      panel.dispatchEvent(new Event("beforematch", { bubbles: true }))
      panel.removeAttribute("hidden")
      assert.isFalse(panel.hasAttribute("data-starting-style"))
      yield* tick
      assert.strictEqual(panel.style.transitionDuration, "0s")
      assert.strictEqual(panel.style.animationDuration, "0s")
      assert.deepStrictEqual(log(), ["Toggled true find-in-page"])

      finish()
      yield* tick
      assert.deepStrictEqual(log(), [
        "Toggled true find-in-page",
        "Settled true"
      ])
      assert.isFalse(panel.hasAttribute("hidden"))
      assert.isFalse(panel.hasAttribute("data-starting-style"))
      assert.strictEqual(panel.style.transitionDuration, "150ms")
      assert.strictEqual(panel.style.animationDuration, "150ms")
    }))

  it.effect("refused, overlapping, and disabled reveals restore hidden until found and starting style", () =>
    Effect.gen(function*() {
      yield* Effect.scoped(Effect.gen(function*() {
        const { log } = yield* mountPage({
          hiddenUntilFound: true,
          refuse: true
        })
        const panel = byId("panel")
        panel.dispatchEvent(new Event("beforematch", { bubbles: true }))
        panel.dispatchEvent(new Event("beforematch", { bubbles: true }))
        panel.removeAttribute("hidden")
        yield* tick
        yield* tick
        assert.deepStrictEqual(log(), [
          "Toggled true find-in-page",
          "Toggled true find-in-page"
        ])
        assert.strictEqual(panel.getAttribute("hidden"), "until-found")
        assert.isTrue(panel.hasAttribute("data-starting-style"))
        assert.notInclude(panel.getAttribute("style") ?? "", "duration")
      }))

      const { log } = yield* mountPage({
        hiddenUntilFound: true,
        disabled: true
      })
      const panel = byId("panel")
      panel.dispatchEvent(new Event("beforematch", { bubbles: true }))
      panel.removeAttribute("hidden")
      yield* tick
      yield* tick
      assert.deepStrictEqual(log(), [])
      assert.strictEqual(panel.getAttribute("hidden"), "until-found")
      assert.isTrue(panel.hasAttribute("data-starting-style"))
      assert.notInclude(panel.getAttribute("style") ?? "", "duration")
    }))
})
