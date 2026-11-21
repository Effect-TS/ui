// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Tooltip } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, container, tick } from "./utils/document.ts"

const rects = new Map<string, { x: number; y: number; width: number; height: number }>()
const layouts = new Map<string, { width: number; height: number }>()
const content = { width: 200, height: 100 }

const resizeObservers = new Set<FakeResizeObserver>()
let deliveries = 0

class FakeResizeObserver {
  readonly observed = new Set<Element>()
  readonly pending = new Set<Element>()
  timer: ReturnType<typeof setTimeout> | undefined
  constructor(readonly callback: (entries: Array<{ target: Element }>, observer: FakeResizeObserver) => void) {
    resizeObservers.add(this)
  }
  observe(target: Element) {
    this.observed.add(target)
    this.queue(target)
  }
  unobserve(target: Element) {
    this.observed.delete(target)
    this.pending.delete(target)
  }
  disconnect() {
    this.observed.clear()
    this.pending.clear()
    clearTimeout(this.timer)
    resizeObservers.delete(this)
  }
  queue(target: Element) {
    if (!this.observed.has(target)) return
    this.pending.add(target)
    this.timer ??= setTimeout(() => {
      this.timer = undefined
      const targets = [...this.observed].filter((element) => this.pending.has(element))
      this.pending.clear()
      if (targets.length === 0) return
      deliveries++
      this.callback(targets.map((target) => ({ target })), this)
    }, 0)
  }
}

const resize = (target: Element) => {
  for (const observer of resizeObservers) observer.queue(target)
}

const geometry = Effect.acquireRelease(
  Effect.sync(() => {
    const element = window.Element.prototype as any
    const html = window.HTMLElement.prototype as any
    const root = document.documentElement as any
    const saved = {
      rect: element.getBoundingClientRect,
      matches: element.matches,
      offsetWidth: Object.getOwnPropertyDescriptor(html, "offsetWidth"),
      offsetHeight: Object.getOwnPropertyDescriptor(html, "offsetHeight"),
      clientWidth: Object.getOwnPropertyDescriptor(html, "clientWidth"),
      clientHeight: Object.getOwnPropertyDescriptor(html, "clientHeight"),
      ResizeObserver: (window as any).ResizeObserver
    }
    ;(window as any).ResizeObserver = FakeResizeObserver
    const showing = new Set<Element>()
    html.showPopover = function(this: HTMLElement) {
      showing.add(this)
    }
    html.hidePopover = function(this: HTMLElement) {
      showing.delete(this)
    }
    element.matches = function(this: Element, selector: string) {
      return selector === ":popover-open" ? showing.has(this) : saved.matches.call(this, selector)
    }
    element.getBoundingClientRect = function(this: Element) {
      const { height, width, x, y } = rects.get(this.id) ?? { x: 0, y: 0, ...size(this) }
      return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height }
    }
    const size = (node: Element) => {
      const style = (node as HTMLElement).style
      const padding = (side: string) => parseFloat(style.getPropertyValue("padding-" + side)) || 0
      if (node.id === "positioner") {
        return {
          width: content.width + padding("left") + padding("right"),
          height: content.height + padding("top") + padding("bottom")
        }
      }
      if (node.id.endsWith("arrow")) return { width: 10, height: 10 }
      return layouts.get(node.id) ?? { width: 0, height: 0 }
    }
    Object.defineProperty(html, "offsetWidth", {
      configurable: true,
      get: function(this: Element) {
        return size(this).width
      }
    })
    Object.defineProperty(html, "offsetHeight", {
      configurable: true,
      get: function(this: Element) {
        return size(this).height
      }
    })
    Object.defineProperty(html, "clientWidth", {
      configurable: true,
      get: function(this: Element) {
        return layouts.get(this.id)?.width ?? 0
      }
    })
    Object.defineProperty(html, "clientHeight", {
      configurable: true,
      get: function(this: Element) {
        return layouts.get(this.id)?.height ?? 0
      }
    })
    Object.defineProperty(root, "clientWidth", { configurable: true, value: 1000 })
    Object.defineProperty(root, "clientHeight", { configurable: true, value: 800 })
    return () => {
      element.getBoundingClientRect = saved.rect
      element.matches = saved.matches
      delete html.showPopover
      delete html.hidePopover
      Object.defineProperty(html, "offsetWidth", saved.offsetWidth!)
      Object.defineProperty(html, "offsetHeight", saved.offsetHeight!)
      if (saved.clientWidth === undefined) delete html.clientWidth
      else Object.defineProperty(html, "clientWidth", saved.clientWidth)
      if (saved.clientHeight === undefined) delete html.clientHeight
      else Object.defineProperty(html, "clientHeight", saved.clientHeight)
      ;(window as any).ResizeObserver = saved.ResizeObserver
      for (const observer of resizeObservers) observer.disconnect()
      deliveries = 0
      content.width = 200
      content.height = 100
      layouts.clear()
      delete root.clientWidth
      delete root.clientHeight
      rects.clear()
    }
  }),
  (restore) => Effect.sync(restore)
)

const Message = UiSchema.TaggedEnum({ Closed: {}, Opened: {} })

const Page = Component.define({
  name: "Page",
  props: Schema.Struct({ sideOffset: Schema.Number }),
  model: Schema.Struct({ open: Schema.Boolean }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ open: true }),
  update: {
    Closed: (model) => ({ ...model, open: false }),
    Opened: (model) => ({ ...model, open: true })
  },
  view: (model, h) =>
    Tooltip(h, {
      props: { open: model.open, side: "bottom", sideOffset: h.props.sideOffset },
      view: (s) =>
        h.div.attr("id", "clip").children(
          s.trigger(h.button.attr("id", "trigger")).children("B"),
          s.positioner(h.div.attr("id", "positioner")).children(
            s.popup(h.div.attr("id", "popup")).children(s.arrow(h.div), "Bold")
          )
        )
    })
})

const mountPage = Effect.fnUntraced(function*(sideOffset = 8) {
  yield* geometry
  rects.set("trigger", rects.get("trigger") ?? { x: 400, y: 700, width: 100, height: 40 })
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, { sideOffset }, app)
  yield* tick
  return root
})

const style = (name: string) => byId("positioner").style.getPropertyValue(name)

describe("Tooltip in a document", { concurrent: false }, () => {
  it.effect("places the positioner itself, flipped above a trigger near the bottom, and reports the side", () =>
    Effect.gen(function*() {
      yield* mountPage()
      assert.strictEqual(style("left"), "350px")
      assert.strictEqual(style("top"), "592px")
      assert.strictEqual(style("padding-bottom"), "8px")
      assert.strictEqual(style("--anchor-width"), "100px")
      assert.strictEqual(style("--anchor-height"), "40px")
      assert.strictEqual(style("--transform-origin"), "100px calc(100% + 8px)")
      assert.strictEqual(style("--available-height"), "687px")
      assert.strictEqual(byId("positioner").getAttribute("data-side"), "top")
      assert.strictEqual(byId("popup").getAttribute("data-side"), "top")
      assert.isNull(byId("positioner").getAttribute("data-anchor-hidden"))
    }).pipe(Effect.scoped))

  it.effect("writes the position back when the style attribute is replaced", () =>
    Effect.gen(function*() {
      yield* mountPage()
      byId("positioner").setAttribute("style", "position:absolute")
      yield* tick
      assert.strictEqual(style("left"), "350px")
      assert.strictEqual(style("top"), "592px")
    }).pipe(Effect.scoped))

  it.effect("measures once a size settles, and again when the positioner resizes", () =>
    Effect.gen(function*() {
      yield* mountPage()
      const settled = deliveries
      yield* tick
      yield* tick
      assert.strictEqual(deliveries, settled)

      content.height = 150
      resize(byId("positioner"))
      yield* tick
      assert.strictEqual(style("top"), "542px")
    }).pipe(Effect.scoped))

  it.effect("clips the trigger to a scaled ancestor's visible box", () =>
    Effect.gen(function*() {
      rects.set("trigger", { x: 240, y: 300, width: 20, height: 20 })
      yield* mountPage()
      byId("clip").style.overflow = "hidden"
      rects.set("clip", { x: 100, y: 250, width: 200, height: 200 })
      layouts.set("clip", { width: 100, height: 100 })
      byId("popup").dispatchEvent(new Event("scroll"))
      yield* tick
      assert.isNull(byId("positioner").getAttribute("data-anchor-hidden"))

      rects.set("trigger", { x: 320, y: 300, width: 20, height: 20 })
      byId("popup").dispatchEvent(new Event("scroll"))
      yield* tick
      assert.strictEqual(byId("positioner").getAttribute("data-anchor-hidden"), "")
    }).pipe(Effect.scoped))

  it.effect("overlaps the trigger by a negative side offset, with no gap to bridge", () =>
    Effect.gen(function*() {
      rects.set("trigger", { x: 400, y: 300, width: 100, height: 40 })
      yield* mountPage(-8)
      assert.strictEqual(style("top"), "332px")
      assert.strictEqual(style("padding-top"), "")
    }).pipe(Effect.scoped))

  it.effect("follows the trigger on a scroll until the tooltip closes, and reopens on another side", () =>
    Effect.gen(function*() {
      const root = yield* mountPage()
      rects.set("trigger", { x: 400, y: 300, width: 100, height: 40 })
      byId("popup").dispatchEvent(new Event("scroll"))
      assert.strictEqual(style("top"), "340px")
      assert.strictEqual(style("padding-top"), "8px")
      assert.strictEqual(style("padding-bottom"), "")
      yield* tick
      assert.strictEqual(byId("positioner").getAttribute("data-side"), "bottom")

      root.send(Message.Closed())
      yield* tick
      rects.set("trigger", { x: 0, y: 0, width: 100, height: 40 })
      byId("popup").dispatchEvent(new Event("scroll"))
      assert.strictEqual(style("top"), "340px")

      rects.set("trigger", { x: 400, y: 700, width: 100, height: 40 })
      root.send(Message.Opened())
      yield* tick
      assert.strictEqual(style("padding-top"), "")
      assert.strictEqual(style("padding-bottom"), "8px")
      assert.strictEqual(style("top"), "592px")
    }).pipe(Effect.scoped))
})
