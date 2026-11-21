// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Tooltip } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, container, tick } from "./utils/document.ts"

const rects = new Map<string, { x: number; y: number; width: number; height: number }>()

const geometry = Effect.acquireRelease(
  Effect.sync(() => {
    const element = window.Element.prototype as any
    const html = window.HTMLElement.prototype as any
    const root = document.documentElement as any
    const saved = {
      rect: element.getBoundingClientRect,
      matches: element.matches,
      offsetWidth: Object.getOwnPropertyDescriptor(html, "offsetWidth"),
      offsetHeight: Object.getOwnPropertyDescriptor(html, "offsetHeight")
    }
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
        return { width: 200 + padding("left") + padding("right"), height: 100 + padding("top") + padding("bottom") }
      }
      if (node.id.endsWith("arrow")) return { width: 10, height: 10 }
      return { width: 0, height: 0 }
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
    Object.defineProperty(root, "clientWidth", { configurable: true, value: 1000 })
    Object.defineProperty(root, "clientHeight", { configurable: true, value: 800 })
    return () => {
      element.getBoundingClientRect = saved.rect
      element.matches = saved.matches
      delete html.showPopover
      delete html.hidePopover
      Object.defineProperty(html, "offsetWidth", saved.offsetWidth!)
      Object.defineProperty(html, "offsetHeight", saved.offsetHeight!)
      delete root.clientWidth
      delete root.clientHeight
      rects.clear()
    }
  }),
  (restore) => Effect.sync(restore)
)

const Message = UiSchema.TaggedEnum({ Closed: {} })

const Page = Component.define({
  name: "Page",
  model: Schema.Struct({ open: Schema.Boolean }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ open: true }),
  update: { Closed: (model) => ({ ...model, open: false }) },
  view: (model, h) =>
    Tooltip(h, {
      props: { open: model.open, side: "bottom", sideOffset: 8 },
      view: (s) =>
        h.div(
          s.trigger(h.button.attr("id", "trigger")).children("B"),
          s.positioner(h.div.attr("id", "positioner")).children(
            s.popup(h.div.attr("id", "popup")).children(s.arrow(h.div), "Bold")
          )
        )
    })
})

const mountPage = Effect.gen(function*() {
  yield* geometry
  rects.set("trigger", { x: 400, y: 700, width: 100, height: 40 })
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, {}, app)
  yield* tick
  return root
})

const style = (name: string) => byId("positioner").style.getPropertyValue(name)

describe("Tooltip in a document", { concurrent: false }, () => {
  it.effect("places the positioner itself, flipped above a trigger near the bottom, and reports the side", () =>
    Effect.gen(function*() {
      yield* mountPage
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
      yield* mountPage
      byId("positioner").setAttribute("style", "position:absolute")
      yield* tick
      assert.strictEqual(style("left"), "350px")
      assert.strictEqual(style("top"), "592px")
    }).pipe(Effect.scoped))

  it.effect("follows the trigger on a scroll until the tooltip closes", () =>
    Effect.gen(function*() {
      const root = yield* mountPage
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
    }).pipe(Effect.scoped))
})
