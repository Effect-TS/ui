// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Tooltip } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, container, popovers, tick } from "./utils/document.ts"

const rects = new Map<
  string,
  { x: number; y: number; width: number; height: number }
>()
const layouts = new Map<string, { width: number; height: number }>()
const content = { width: 200, height: 100 }
let heightFor: ((node: Element) => number) | null = null

const resizeObservers = new Set<FakeResizeObserver>()
let deliveries = 0

class FakeResizeObserver {
  readonly observed = new Set<Element>()
  readonly bordered = new Set<Element>()
  readonly pending = new Set<Element>()
  timer: ReturnType<typeof setTimeout> | undefined
  constructor(
    readonly callback: (
      entries: Array<{ target: Element }>,
      observer: FakeResizeObserver
    ) => void
  ) {
    resizeObservers.add(this)
  }
  observe(target: Element, options?: { readonly box?: string }) {
    this.observed.add(target)
    if (options?.box === "border-box") this.bordered.add(target)
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
      const targets = [...this.observed].filter((element) =>
        this.pending.has(element)
      )
      this.pending.clear()
      if (targets.length === 0) return
      deliveries++
      this.callback(targets.map((target) => ({ target })), this)
    }, 0)
  }
}

const resize = (target: Element, borderOnly = false) => {
  for (const observer of resizeObservers) {
    if (!borderOnly || observer.bordered.has(target)) observer.queue(target)
  }
}

const geometry = Effect.acquireRelease(
  Effect.sync(() => {
    const element = window.Element.prototype as any
    const html = window.HTMLElement.prototype as any
    const root = document.documentElement as any
    const saved = {
      rect: element.getBoundingClientRect,
      offsetWidth: Object.getOwnPropertyDescriptor(html, "offsetWidth"),
      offsetHeight: Object.getOwnPropertyDescriptor(html, "offsetHeight"),
      clientWidth: Object.getOwnPropertyDescriptor(html, "clientWidth"),
      clientHeight: Object.getOwnPropertyDescriptor(html, "clientHeight"),
      ResizeObserver: (window as any).ResizeObserver
    }
    ;(window as any).ResizeObserver = FakeResizeObserver
    element.getBoundingClientRect = function(this: Element) {
      const { height, width, x, y } = rects.get(this.id) ??
        { x: 0, y: 0, ...size(this) }
      return {
        x,
        y,
        width,
        height,
        left: x,
        top: y,
        right: x + width,
        bottom: y + height
      }
    }
    const size = (node: Element) => {
      const style = (node as HTMLElement).style
      const padding = (side: string) =>
        parseFloat(style.getPropertyValue("padding-" + side)) || 0
      if (node.id === "positioner") {
        return {
          width: content.width + padding("left") + padding("right"),
          height: (heightFor?.(node) ?? content.height) + padding("top") +
            padding("bottom")
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
    Object.defineProperty(root, "clientWidth", {
      configurable: true,
      value: 1000
    })
    Object.defineProperty(root, "clientHeight", {
      configurable: true,
      value: 800
    })
    return () => {
      element.getBoundingClientRect = saved.rect
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
      heightFor = null
      layouts.clear()
      delete root.clientWidth
      delete root.clientHeight
      rects.clear()
    }
  }),
  (restore) => Effect.sync(restore)
)

const Message = UiSchema.TaggedEnum({
  Closed: {},
  RequestedOpen: {},
  Restyled: {}
})

const Page = Html.component({
  name: "Page",
  props: Schema.Struct({
    sideOffset: Schema.Number,
    disableAnchorTracking: Schema.Boolean,
    anchor: Schema.optional(Schema.String)
  }),
  model: Schema.Struct({ open: Schema.Boolean, tinted: Schema.Boolean }),
  message: Message
}).make({
  init: () => ({ open: true, tinted: false }),
  update: {
    Closed: ($) => ({ ...$.model, open: false }),
    RequestedOpen: ($) => ({ ...$.model, open: true }),
    Restyled: ($) => ({ ...$.model, tinted: !$.model.tinted })
  },
  view: (h, model) =>
    Tooltip(h, {
      props: {
        open: model.open,
        side: "bottom",
        sideOffset: h.props.sideOffset,
        disableAnchorTracking: h.props.disableAnchorTracking,
        anchor: h.props.anchor
      },
      onEmit: (event) =>
        event._tag === "RequestedOpen"
          ? Message.RequestedOpen()
          : Message.Closed(),
      view: (tooltip) =>
        h.div.attr("id", "clip").children(
          h.div.attr("id", "layer").children(
            tooltip.trigger(h.button.attr("id", "trigger")).children("B")
          ),
          tooltip.positioner(
            h.div.attr("id", "positioner").style(
              model.tinted ? { zIndex: "10" } : {}
            )
          ).children(
            tooltip.popup(h.div.attr("id", "popup")).children(
              tooltip.arrow(h.div),
              "Bold"
            )
          )
        )
    })
})

const mountPage = Effect.fnUntraced(
  function*(sideOffset = 8, disableAnchorTracking = false, anchor?: string) {
    yield* popovers
    yield* geometry
    rects.set(
      "trigger",
      rects.get("trigger") ?? { x: 400, y: 700, width: 100, height: 40 }
    )
    const app = yield* container
    const root = yield* BrowserHost.mountEffect(Page, {
      sideOffset,
      disableAnchorTracking,
      anchor
    }, app)
    yield* tick
    return root
  }
)

const style = (name: string) => byId("positioner").style.getPropertyValue(name)

const mouse = (
  target: Element,
  type: "mouseenter" | "mouseleave" | "mousemove",
  clientX: number,
  clientY: number
) =>
  target.dispatchEvent(
    new MouseEvent(type, { clientX, clientY, bubbles: type === "mousemove" })
  )

describe("Tooltip in a document", { concurrent: false }, () => {
  it.effect("a diagonal move from a narrow trigger to a wider popup keeps it open, while leaving away closes it", () =>
    Effect.gen(function*() {
      rects.set("trigger", { x: 400, y: 300, width: 40, height: 20 })
      const root = yield* mountPage()
      const open = () => root.model()!.open
      rects.set("positioner", { x: 320, y: 320, width: 200, height: 108 })
      const trigger = byId("trigger")
      mouse(trigger, "mouseenter", 430, 310)
      // Out of the trigger's side, above the positioner, toward the popup.
      mouse(trigger, "mouseleave", 440.5, 315)
      mouse(document.body, "mousemove", 450, 318)
      yield* tick
      assert.isTrue(open())
      mouse(byId("popup"), "mousemove", 480, 360)
      yield* tick
      assert.isTrue(open())
      mouse(document.body, "mousemove", 800, 100)
      yield* tick
      assert.isFalse(open())

      // A fast move reports the leave where the pointer already is: the
      // triangle still starts on the trigger.
      root.send(Message.RequestedOpen())
      yield* tick
      mouse(trigger, "mouseenter", 430, 310)
      mouse(trigger, "mouseleave", 430, 100)
      mouse(document.body, "mousemove", 430, 100)
      yield* tick
      assert.isFalse(open())
    }).pipe(Effect.scoped))

  it.effect("a tooltip the consumer opened stays open as the pointer moves elsewhere, until a press", () =>
    Effect.gen(function*() {
      const root = yield* mountPage()
      const open = () => root.model()!.open
      mouse(document.body, "mousemove", 10, 10)
      yield* tick
      assert.isTrue(open())
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 10, clientY: 10, bubbles: true })
      )
      yield* tick
      assert.isFalse(open())
    }).pipe(Effect.scoped))

  it.effect("a press on the popup keeps it open, while a press in the triangle closes it", () =>
    Effect.gen(function*() {
      rects.set("trigger", { x: 400, y: 300, width: 40, height: 20 })
      const root = yield* mountPage()
      const open = () => root.model()!.open
      rects.set("positioner", { x: 320, y: 320, width: 200, height: 108 })
      const trigger = byId("trigger")
      const pressAt = (target: Element, clientX: number, clientY: number) =>
        target.dispatchEvent(
          new MouseEvent("mousedown", { clientX, clientY, bubbles: true })
        )
      mouse(trigger, "mouseenter", 430, 310)
      mouse(trigger, "mouseleave", 440.5, 315)
      mouse(byId("positioner"), "mouseenter", 480, 360)
      mouse(byId("popup"), "mousemove", 480, 360)
      pressAt(byId("popup"), 480, 360)
      yield* tick
      assert.isTrue(open())

      mouse(byId("positioner"), "mouseleave", 450, 318)
      mouse(document.body, "mousemove", 450, 318)
      pressAt(document.body, 450, 318)
      yield* tick
      assert.isFalse(open())
    }).pipe(Effect.scoped))

  it.effect("a pointer in the triangle when Escape closes it doesn't hold the next keyboard visit open", () =>
    Effect.gen(function*() {
      rects.set("trigger", { x: 400, y: 300, width: 40, height: 20 })
      const root = yield* mountPage()
      const open = () => root.model()!.open
      rects.set("positioner", { x: 320, y: 320, width: 200, height: 108 })
      const trigger = byId("trigger")
      mouse(trigger, "mouseenter", 430, 310)
      mouse(trigger, "mouseleave", 440.5, 315)
      mouse(document.body, "mousemove", 450, 318)
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
      yield* tick
      assert.isFalse(open())
      mouse(document.body, "mousemove", 800, 100)

      trigger.focus()
      yield* tick
      assert.isTrue(open())
      trigger.blur()
      yield* tick
      assert.isFalse(open())
    }).pipe(Effect.scoped))

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

  it.effect("keeps the position when a render changes the positioner's style", () =>
    Effect.gen(function*() {
      const root = yield* mountPage()
      root.send(Message.Restyled())
      yield* tick
      assert.strictEqual(style("z-index"), "10")
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

  it.effect("reports the trigger hidden only when a containing ancestor clips it", () =>
    Effect.gen(function*() {
      rects.set("trigger", { x: 240, y: 300, width: 20, height: 20 })
      yield* mountPage()
      const clip = byId("clip")
      const trigger = byId("trigger")
      clip.style.overflow = "hidden"
      rects.set("clip", { x: 100, y: 250, width: 200, height: 200 })
      layouts.set("clip", { width: 100, height: 100 })
      const hidden = Effect.gen(function*() {
        document.dispatchEvent(new Event("scroll"))
        yield* tick
        return byId("positioner").getAttribute("data-anchor-hidden") === ""
      })

      assert.isFalse(yield* hidden)
      rects.set("trigger", { x: 320, y: 300, width: 20, height: 20 })
      assert.isTrue(yield* hidden)

      trigger.style.position = "fixed"
      assert.isFalse(yield* hidden)
      clip.style.transform = "translateX(0)"
      assert.isTrue(yield* hidden)
      clip.style.transform = ""
      clip.style.willChange = "transform-origin"
      assert.isFalse(yield* hidden)
      clip.style.willChange = "left, Offset-Path"
      assert.isTrue(yield* hidden)
      clip.style.willChange = ""

      trigger.style.position = "absolute"
      assert.isFalse(yield* hidden)
      clip.style.position = "relative"
      assert.isTrue(yield* hidden)

      clip.style.position = ""
      trigger.style.position = "fixed"
      clip.style.transform = "translateX(0)"
      byId("layer").showPopover()
      assert.isFalse(yield* hidden)
    }).pipe(Effect.scoped))

  it.effect("overlaps the trigger by a negative side offset, with no gap to bridge", () =>
    Effect.gen(function*() {
      rects.set("trigger", { x: 400, y: 300, width: 100, height: 40 })
      yield* mountPage(-8)
      assert.strictEqual(style("top"), "332px")
      assert.strictEqual(style("padding-top"), "")
    }).pipe(Effect.scoped))

  it.effect("re-measures when a flip changes the popup's size, with anchor tracking disabled", () =>
    Effect.gen(function*() {
      rects.set("trigger", { x: 400, y: 300, width: 100, height: 40 })
      heightFor = (node) => node.getAttribute("data-side") === "top" ? 100 : 40
      yield* mountPage(8, true)
      assert.strictEqual(style("top"), "340px")
      assert.deepStrictEqual(
        [...resizeObservers].flatMap((observer) => [...observer.observed]),
        [byId("positioner")]
      )

      rects.set("trigger", { x: 400, y: 760, width: 100, height: 40 })
      window.dispatchEvent(new Event("resize"))
      yield* tick
      assert.strictEqual(byId("positioner").getAttribute("data-side"), "top")
      resize(byId("positioner"), true)
      yield* tick
      assert.strictEqual(style("top"), "652px")
    }).pipe(Effect.scoped))

  it.effect("places against the element that matches the anchor now, and reports it hidden once none does", () =>
    Effect.gen(function*() {
      const first = yield* container
      const second = yield* container
      const left = { x: 100, y: 300, width: 100, height: 40 }
      const right = { x: 500, y: 300, width: 100, height: 40 }
      first.id = "spot"
      rects.set("spot", left)
      yield* mountPage(8, false, "spot")
      assert.strictEqual(style("left"), "50px")

      first.id = "first"
      rects.set("first", left)
      second.id = "spot"
      rects.set("spot", right)
      window.dispatchEvent(new Event("resize"))
      assert.strictEqual(style("left"), "450px")

      second.id = "second"
      rects.set("second", right)
      window.dispatchEvent(new Event("resize"))
      yield* tick
      assert.strictEqual(
        byId("positioner").getAttribute("data-anchor-hidden"),
        ""
      )
    }).pipe(Effect.scoped))

  it.effect("follows the trigger on a scroll until the tooltip closes, and reopens on another side", () =>
    Effect.gen(function*() {
      const root = yield* mountPage()
      rects.set("trigger", { x: 400, y: 300, width: 100, height: 40 })
      document.dispatchEvent(new Event("scroll"))
      assert.strictEqual(style("top"), "340px")
      assert.strictEqual(style("padding-top"), "8px")
      assert.strictEqual(style("padding-bottom"), "")
      yield* tick
      assert.strictEqual(byId("positioner").getAttribute("data-side"), "bottom")

      root.send(Message.Closed())
      yield* tick
      rects.set("trigger", { x: 0, y: 0, width: 100, height: 40 })
      document.dispatchEvent(new Event("scroll"))
      assert.strictEqual(style("top"), "340px")

      rects.set("trigger", { x: 400, y: 700, width: 100, height: 40 })
      root.send(Message.RequestedOpen())
      yield* tick
      assert.strictEqual(style("padding-top"), "")
      assert.strictEqual(style("padding-bottom"), "8px")
      assert.strictEqual(style("top"), "592px")
    }).pipe(Effect.scoped))
})
