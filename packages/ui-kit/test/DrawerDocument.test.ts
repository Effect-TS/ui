// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Drawer } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, popovers, tick } from "./utils/document.ts"

const Config = Schema.Struct({
  open: Schema.Boolean,
  direction: Schema.Literals(["up", "down", "left", "right"]),
  snapPoints: Schema.optional(Schema.Array(Schema.Number)),
  refuse: Schema.Boolean,
  area: Schema.Boolean,
  scroll: Schema.Boolean
})
type Config = typeof Config.Type

const config = (overrides: Partial<Config>): Config => ({
  open: true,
  direction: "down",
  refuse: false,
  area: false,
  scroll: false,
  ...overrides
})

const Message = UiSchema.TaggedEnum({
  Opened: { reason: Schema.String },
  Dismissed: { reason: Schema.String },
  Snapped: { snapPoint: Schema.Union([Schema.Number, Schema.String]) },
  Settled: { open: Schema.Boolean }
})

const Page = Component.define({
  name: "Page",
  props: Config,
  model: Schema.Struct({
    open: Schema.Boolean,
    snapPoint: Schema.NullOr(Schema.Union([Schema.Number, Schema.String])),
    events: Schema.Array(Schema.String),
    config: Config
  }),
  message: Message,
  elements: Html
}).make({
  init: ({ props }) => ({ open: props.open, snapPoint: null, events: [], config: props }),
  update: {
    Opened: (model, { reason }) => ({
      ...model,
      open: !model.config.refuse,
      events: [...model.events, "Opened:" + reason]
    }),
    Dismissed: (model, { reason }) => ({
      ...model,
      open: model.config.refuse,
      events: [...model.events, "Dismissed:" + reason]
    }),
    Snapped: (model, { snapPoint }) => ({ ...model, snapPoint, events: [...model.events, "Snapped:" + snapPoint] }),
    Settled: (model, { open }) => ({ ...model, events: [...model.events, "Settled:" + open] })
  },
  view: (model, h) => {
    const props = model.config
    return Drawer(h, {
      props: {
        open: model.open,
        swipeDirection: props.direction,
        snapPoints: props.snapPoints,
        snapPoint: model.snapPoint
      },
      onEmit: {
        Opened: ({ reason }) => Message.Opened({ reason }),
        Dismissed: ({ reason }) => Message.Dismissed({ reason }),
        Snapped: ({ snapPoint }) => Message.Snapped({ snapPoint }),
        Settled: ({ open }) => Message.Settled({ open })
      },
      view: (drawer) =>
        h.div(
          props.area ? drawer.swipeArea({ element: h.div.attr("id", "area") }) : undefined,
          drawer.portal(h.dialog)?.children(
            drawer.backdrop(h.div.attr("id", "backdrop")),
            drawer.viewport(h.div.attr("id", "viewport")).children(
              drawer.popup(h.div.attr("id", "popup")).children(
                h.p.attr("id", "handle").children("Handle"),
                drawer.content(h.div.attr("id", "content")).children("Text"),
                h.button.attr("id", "button").children("Go"),
                props.scroll
                  ? h.div.attr("id", "scroller").attr("style", "overflow-y:auto").children("Long")
                  : undefined
              )
            )
          )
        )
    })
  }
})

let time = 100
const pointer = (target: EventTarget, type: string, x: number, y: number, buttons = 1) => {
  time += 16
  const event = new PointerEvent(type, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    button: 0,
    buttons,
    pointerType: "mouse",
    isPrimary: true,
    bubbles: true,
    cancelable: true,
    composed: true
  })
  Object.defineProperty(event, "timeStamp", { value: time })
  target.dispatchEvent(event)
}

const drag = (target: Element, from: [number, number], to: [number, number], steps = 4) => {
  pointer(target, "pointerdown", from[0], from[1])
  for (let i = 1; i <= steps; i++) {
    pointer(
      document,
      "pointermove",
      from[0] + (to[0] - from[0]) * i / steps,
      from[1] + (to[1] - from[1]) * i / steps
    )
  }
}

const sized = (element: Element, width: number, height: number) => {
  Object.defineProperty(element, "offsetWidth", { configurable: true, value: width })
  Object.defineProperty(element, "offsetHeight", { configurable: true, value: height })
}

const touch = (target: Element, type: string, x: number, y: number) => {
  time += 16
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true })
  const points = type === "touchend" || type === "touchcancel"
    ? []
    : [{ clientX: x, clientY: y, identifier: 1, target }]
  Object.defineProperty(event, "touches", { value: points })
  Object.defineProperty(event, "timeStamp", { value: time })
  target.dispatchEvent(event)
  return event
}

const swipeTouch = (target: Element, from: [number, number], to: [number, number], steps = 4) => {
  touch(target, "touchstart", from[0], from[1])
  const moves: Array<Event> = []
  for (let i = 1; i <= steps; i++) {
    moves.push(
      touch(target, "touchmove", from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps)
    )
  }
  return moves
}

const movement = () => popup().style.getPropertyValue("--drawer-swipe-movement-y")

const mount = Effect.fnUntraced(function*(overrides: Partial<Config>) {
  yield* popovers
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, config(overrides), app)
  yield* tick
  return root
})

const popup = () => document.querySelector<HTMLElement>("[data-drawer-popup]")!

describe("Drawer in a document", { concurrent: false }, () => {
  it.effect("writes the movement while a drag runs and dismisses on a long release", () =>
    Effect.gen(function*() {
      const root = yield* mount({})
      sized(popup(), 300, 200)
      drag(document.getElementById("handle")!, [10, 10], [10, 150])
      assert.strictEqual(popup().style.getPropertyValue("--drawer-swipe-movement-y"), "140px")
      assert.strictEqual(popup().style.getPropertyValue("transition"), "none")
      yield* tick
      assert.strictEqual(popup().getAttribute("data-swiping"), "")
      pointer(document, "pointerup", 10, 150, 0)
      yield* tick
      assert.include(root.model()!.events, "Dismissed:swipe")
      assert.strictEqual(popup()?.getAttribute("data-swipe-dismiss") ?? "", "")
      assert.isFalse(root.model()!.open)
    }))

  it.effect("settles back on a short release and leaves the resting values", () =>
    Effect.gen(function*() {
      const root = yield* mount({})
      sized(popup(), 300, 200)
      drag(document.getElementById("handle")!, [10, 10], [10, 30], 20)
      pointer(document, "pointerup", 10, 30, 0)
      yield* tick
      assert.notInclude(root.model()!.events, "Dismissed:swipe")
      assert.strictEqual(movement(), "0px")
      assert.strictEqual(popup().style.getPropertyValue("transition"), "")
      assert.isUndefined(popup().getAttributeNode("data-swiping") ?? undefined)
    }))

  it.effect("settles a fast swipe that turned back before the release", () =>
    Effect.gen(function*() {
      const root = yield* mount({})
      sized(popup(), 300, 200)
      drag(document.getElementById("handle")!, [10, 10], [10, 90], 2)
      pointer(document, "pointermove", 10, 60)
      pointer(document, "pointerup", 10, 60, 0)
      yield* tick
      assert.notInclude(root.model()!.events, "Dismissed:swipe")
      assert.isTrue(root.model()!.open)
    }))

  it.effect("starts nothing from the content, a button or an ignored element", () =>
    Effect.gen(function*() {
      const root = yield* mount({})
      sized(popup(), 300, 200)
      for (const id of ["content", "button"]) {
        drag(document.getElementById(id)!, [10, 10], [10, 150])
        pointer(document, "pointerup", 10, 150, 0)
      }
      document.getElementById("handle")!.setAttribute("data-swipe-ignore", "")
      drag(document.getElementById("handle")!, [10, 10], [10, 150])
      pointer(document, "pointerup", 10, 150, 0)
      yield* tick
      assert.isTrue(root.model()!.open)
      assert.notInclude(root.model()!.events, "Dismissed:swipe")
      assert.strictEqual(movement(), "0px")
    }))

  it.effect("takes the swipe back when the consumer keeps the drawer open", () =>
    Effect.gen(function*() {
      const root = yield* mount({ refuse: true })
      sized(popup(), 300, 200)
      drag(document.getElementById("handle")!, [10, 10], [10, 150])
      pointer(document, "pointerup", 10, 150, 0)
      yield* tick
      yield* tick
      assert.include(root.model()!.events, "Dismissed:swipe")
      assert.isTrue(root.model()!.open)
      assert.strictEqual(movement(), "0px")
      assert.isNull(popup().getAttribute("data-swipe-dismiss"))
    }))

  it.effect("claims a touch with nothing to scroll and prevents the page's scroll", () =>
    Effect.gen(function*() {
      const root = yield* mount({})
      sized(popup(), 300, 200)
      const moves = swipeTouch(document.getElementById("handle")!, [10, 10], [10, 150])
      assert.isTrue(moves.every((event) => event.defaultPrevented))
      assert.strictEqual(movement(), "140px")
      touch(document.getElementById("handle")!, "touchend", 10, 150)
      yield* tick
      assert.include(root.model()!.events, "Dismissed:swipe")
    }))

  it.effect("lets a scrolled list scroll, and hands off to the swipe at its top edge", () =>
    Effect.gen(function*() {
      const root = yield* mount({ scroll: true })
      sized(popup(), 300, 400)
      const scroller = document.getElementById("scroller")!
      Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1000 })
      Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 200 })
      scroller.scrollTop = 100
      const scrolling = swipeTouch(scroller, [10, 10], [10, 150])
      assert.isFalse(scrolling.some((event) => event.defaultPrevented))
      touch(scroller, "touchend", 10, 150)
      assert.strictEqual(movement(), "0px")
      scroller.scrollTop = 0
      const swiping = swipeTouch(scroller, [10, 10], [10, 250])
      assert.isTrue(swiping.every((event) => event.defaultPrevented))
      assert.strictEqual(movement(), "180px")
      touch(scroller, "touchend", 10, 250)
      yield* tick
      assert.include(root.model()!.events, "Dismissed:swipe")
    }))

  it.effect("opens from a swipe area, follows the finger once open, and its click doesn't dismiss", () =>
    Effect.gen(function*() {
      const root = yield* mount({ open: false, area: true })
      const area = document.getElementById("area")!
      assert.strictEqual(area.getAttribute("data-swipe-direction"), "up")
      assert.include(area.getAttribute("style") ?? "", "touch-action:pan-x")
      pointer(area, "pointerdown", 10, 500)
      pointer(document, "pointermove", 10, 495)
      yield* tick
      assert.deepStrictEqual(root.model()!.events.slice(0, 1), ["Opened:swipe"])
      sized(popup(), 300, 200)
      pointer(document, "pointermove", 10, 400)
      assert.strictEqual(movement(), "100px")
      assert.strictEqual(popup().style.getPropertyValue("transition"), "none")
      pointer(document, "pointerup", 10, 380, 0)
      area.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
      yield* tick
      assert.isTrue(root.model()!.open)
      assert.notInclude(root.model()!.events, "Dismissed:outside-press")
      assert.strictEqual(movement(), "0px")
      assert.strictEqual(popup().style.getPropertyValue("transition"), "")
    }))

  it.effect("closes again when a swipe area's swipe stops short", () =>
    Effect.gen(function*() {
      const root = yield* mount({ open: false, area: true })
      const area = document.getElementById("area")!
      pointer(area, "pointerdown", 10, 500)
      pointer(document, "pointermove", 10, 495)
      yield* tick
      sized(popup(), 300, 200)
      time += 200
      pointer(document, "pointermove", 10, 480)
      time += 200
      pointer(document, "pointerup", 10, 480, 0)
      yield* tick
      assert.include(root.model()!.events, "Dismissed:swipe")
      assert.isFalse(root.model()!.open)
    }))
})
