// @vitest-environment happy-dom
import { Component } from "@effect/ui"
import { ScrollArea, type ScrollAreaProps } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const stubMetrics = (
  element: HTMLElement,
  metrics: Partial<{
    clientHeight: number
    clientWidth: number
    scrollHeight: number
    scrollWidth: number
    offsetHeight: number
    offsetWidth: number
  }>
) => {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, { configurable: true, value })
  }
}

const wait = (ms: number) =>
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

const mountArea = Effect.fnUntraced(function*(
  props: ScrollAreaProps = {},
  options: { readonly keepMounted?: boolean; readonly horizontal?: boolean } =
    {}
) {
  const Demo = Component.define({
    name: "Demo",
    model: Schema.Struct({}),
    message: Schema.Never,
    elements: Html
  }).make({
    init: () => ({}),
    update: ($) => $.model,
    view: (h) =>
      ScrollArea(h, {
        props,
        view: (scrollArea) =>
          scrollArea.root(h.div.class(["root"])).children([
            scrollArea.viewport(h.div.class(["viewport"])).children([
              scrollArea.content(h.div.class(["content"])).children(["Items"])
            ]),
            scrollArea.scrollbar({
              element: h.div.class(["bar-y"]),
              thumb: h.div.class(["thumb-y"]),
              keepMounted: options.keepMounted
            }),
            options.horizontal
              ? scrollArea.scrollbar({
                element: h.div.class(["bar-x"]),
                thumb: h.div.class(["thumb-x"]),
                orientation: "horizontal",
                keepMounted: options.keepMounted
              })
              : undefined,
            options.horizontal
              ? scrollArea.corner(h.div.class(["corner"]))
              : undefined
          ])
      })
  })
  const app = yield* container
  yield* BrowserHost.mountEffect(Demo, {}, app)
  yield* tick
  return {
    root: app.querySelector<HTMLElement>(".root")!,
    viewport: app.querySelector<HTMLElement>(".viewport")!,
    barY: () => app.querySelector<HTMLElement>(".bar-y"),
    thumbY: () => app.querySelector<HTMLElement>(".thumb-y"),
    barX: () => app.querySelector<HTMLElement>(".bar-x"),
    corner: () => app.querySelector<HTMLElement>(".corner")
  }
})

describe("ScrollArea in a document", { concurrent: false }, () => {
  it.effect("computes thumb size, offset, overflow vars, edge thresholds, and corner size", () =>
    Effect.gen(function*() {
      const { barX, barY, corner, root, thumbY, viewport } = yield* mountArea(
        { overflowEdgeThreshold: { yStart: 10, yEnd: 10 } },
        { horizontal: true }
      )
      assert.isNull(barY())
      assert.isNull(corner())

      stubMetrics(viewport, {
        clientHeight: 100,
        scrollHeight: 400,
        clientWidth: 100,
        scrollWidth: 200
      })
      viewport.dispatchEvent(new Event("scroll"))
      yield* tick

      assert.isNotNull(barY())
      assert.isNotNull(barX())
      assert.isNotNull(corner())

      stubMetrics(barY()!, { offsetHeight: 100, offsetWidth: 12 })
      stubMetrics(barX()!, { offsetHeight: 10, offsetWidth: 100 })
      viewport.scrollTop = 150
      viewport.dispatchEvent(new Event("scroll"))
      yield* tick

      assert.strictEqual(
        root.style.getPropertyValue("--scroll-area-corner-width"),
        "12px"
      )
      assert.strictEqual(
        root.style.getPropertyValue("--scroll-area-corner-height"),
        "10px"
      )
      assert.strictEqual(
        barY()!.style.getPropertyValue("--scroll-area-thumb-height"),
        "22.5px"
      )
      assert.strictEqual(
        viewport.style.getPropertyValue("--scroll-area-overflow-y-start"),
        "150px"
      )
      assert.strictEqual(
        viewport.style.getPropertyValue("--scroll-area-overflow-y-end"),
        "150px"
      )
      assert.isTrue(root.hasAttribute("data-overflow-y-start"))
      assert.isTrue(root.hasAttribute("data-overflow-y-end"))
      assert.notStrictEqual(thumbY()!.style.transform, "")

      viewport.scrollTop = 5
      viewport.dispatchEvent(new Event("scroll"))
      yield* tick
      assert.isFalse(root.hasAttribute("data-overflow-y-start"))
      assert.isTrue(root.hasAttribute("data-overflow-y-end"))

      viewport.scrollTop = 1
      viewport.dispatchEvent(new Event("scroll"))
      yield* tick
      assert.strictEqual(
        viewport.style.getPropertyValue("--scroll-area-overflow-y-start"),
        "0px"
      )
    }))

  it.effect("handles track press, thumb drag, missed-release fallback, scroll-snap restore, and wheel chaining", () =>
    Effect.gen(function*() {
      const { barY, thumbY, viewport } = yield* mountArea()
      stubMetrics(viewport, {
        clientHeight: 100,
        scrollHeight: 500,
        clientWidth: 100,
        scrollWidth: 100
      })
      viewport.dispatchEvent(new Event("scroll"))
      yield* tick
      stubMetrics(barY()!, { offsetHeight: 100, offsetWidth: 12 })
      stubMetrics(thumbY()!, { offsetHeight: 20, offsetWidth: 12 })
      barY()!.getBoundingClientRect = () => ({
        top: 0,
        left: 0,
        right: 12,
        bottom: 100,
        width: 12,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({})
      })
      viewport.style.scrollSnapType = "y mandatory"

      const mouseDown = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true
      })
      barY()!.dispatchEvent(mouseDown)
      assert.isTrue(mouseDown.defaultPrevented)

      barY()!.dispatchEvent(
        new PointerEvent("pointerdown", {
          button: 0,
          pointerId: 1,
          clientY: 50,
          bubbles: true
        })
      )
      yield* tick
      assert.strictEqual(viewport.scrollTop, 200)
      assert.strictEqual(viewport.style.scrollSnapType, "none")

      thumbY()!.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientY: 70,
          buttons: 1,
          bubbles: true,
          cancelable: true
        })
      )
      yield* tick
      assert.strictEqual(viewport.scrollTop, 300)
      assert.isTrue(barY()!.hasAttribute("data-scrolling"))

      thumbY()!.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientY: 80,
          buttons: 0,
          bubbles: true,
          cancelable: true
        })
      )
      yield* tick
      assert.strictEqual(viewport.scrollTop, 300)
      assert.strictEqual(viewport.style.scrollSnapType, "y mandatory")
      assert.isFalse(barY()!.hasAttribute("data-scrolling"))

      const wheelMid = new WheelEvent("wheel", {
        deltaY: 50,
        bubbles: true,
        cancelable: true
      })
      barY()!.dispatchEvent(wheelMid)
      assert.isTrue(wheelMid.defaultPrevented)
      assert.strictEqual(viewport.scrollTop, 350)

      viewport.scrollTop = 400
      const wheelEdge = new WheelEvent("wheel", {
        deltaY: 50,
        bubbles: true,
        cancelable: true
      })
      barY()!.dispatchEvent(wheelEdge)
      assert.isFalse(wheelEdge.defaultPrevented)

      thumbY()!.dispatchEvent(
        new PointerEvent("pointerdown", {
          button: 0,
          pointerId: 2,
          clientY: 50,
          bubbles: true
        })
      )
      yield* tick
      assert.strictEqual(viewport.style.scrollSnapType, "none")

      stubMetrics(viewport, { clientHeight: 100, scrollHeight: 100 })
      viewport.dispatchEvent(new Event("scroll"))
      yield* tick
      assert.isNull(barY())
      assert.strictEqual(viewport.style.scrollSnapType, "y mandatory")
    }))

  it.effect("tracks user scroll timer and ignores programmatic scrolls", () =>
    Effect.gen(function*() {
      const { barX, barY, root, viewport } = yield* mountArea({}, {
        keepMounted: true,
        horizontal: true
      })
      stubMetrics(viewport, {
        clientHeight: 100,
        scrollHeight: 400,
        clientWidth: 100,
        scrollWidth: 400
      })

      viewport.scrollLeft = 30
      viewport.dispatchEvent(new Event("scroll"))
      yield* tick
      assert.isFalse(root.hasAttribute("data-scrolling"))
      assert.isFalse(barX()!.hasAttribute("data-scrolling"))

      viewport.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      )
      viewport.scrollTop = 80
      viewport.dispatchEvent(new Event("scroll"))
      yield* tick
      assert.isTrue(root.hasAttribute("data-scrolling"))
      assert.isTrue(barY()!.hasAttribute("data-scrolling"))
      assert.isFalse(barX()!.hasAttribute("data-scrolling"))

      yield* wait(550)
      yield* tick
      assert.isFalse(root.hasAttribute("data-scrolling"))
    }))
})
