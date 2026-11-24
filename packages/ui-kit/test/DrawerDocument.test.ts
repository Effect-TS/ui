// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Drawer, DrawerProvider } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import {
  container,
  holdExits,
  popovers,
  tick,
  visualViewport
} from "./utils/document.ts"

const Config = Schema.Struct({
  open: Schema.Boolean,
  modal: Schema.Boolean,
  direction: Schema.Literals(["up", "down", "left", "right"]),
  snapPoints: Schema.optional(Schema.Array(Schema.Number)),
  refuse: Schema.Boolean,
  area: Schema.Boolean,
  provider: Schema.Boolean,
  scroll: Schema.Boolean,
  keyboard: Schema.Boolean
})
type Config = typeof Config.Type

const config = (overrides: Partial<Config>): Config => ({
  open: true,
  modal: true,
  direction: "down",
  refuse: false,
  area: false,
  provider: false,
  scroll: false,
  keyboard: false,
  ...overrides
})

const Message = UiSchema.TaggedEnum({
  RequestedOpen: { reason: Schema.String },
  RequestedClose: { reason: Schema.String },
  Snapped: { snapPoint: Schema.Union([Schema.Number, Schema.String]) },
  Settled: { open: Schema.Boolean }
})

const Page = Html.component({
  name: "Page",
  props: Config,
  model: Schema.Struct({
    open: Schema.Boolean,
    snapPoint: Schema.NullOr(Schema.Union([Schema.Number, Schema.String])),
    events: Schema.Array(Schema.String),
    config: Config
  }),
  message: Message
}).make({
  init: ({ props }) => ({
    open: props.open,
    snapPoint: null,
    events: [],
    config: props
  }),
  update: {
    RequestedOpen: ($, { reason }) => ({
      ...$.model,
      open: !$.model.config.refuse,
      events: [...$.model.events, "RequestedOpen:" + reason]
    }),
    RequestedClose: ($, { reason }) => ({
      ...$.model,
      open: $.model.config.refuse,
      events: [...$.model.events, "RequestedClose:" + reason]
    }),
    Snapped: ($, { snapPoint }) => ({
      ...$.model,
      snapPoint,
      events: [...$.model.events, "Snapped:" + snapPoint]
    }),
    Settled: ($, { open }) => ({
      ...$.model,
      events: [...$.model.events, "Settled:" + open]
    })
  },
  view: (h, model) => {
    const props = model.config
    const drawer = Drawer(h, {
      props: {
        open: model.open,
        modal: props.modal,
        swipeDirection: props.direction,
        snapPoints: props.snapPoints,
        snapPoint: model.snapPoint,
        virtualKeyboard: props.keyboard
      },
      onEmit: {
        RequestedOpen: ({ reason }) => Message.RequestedOpen({ reason }),
        RequestedClose: ({ reason }) => Message.RequestedClose({ reason }),
        Snapped: ({ snapPoint }) => Message.Snapped({ snapPoint }),
        Settled: ({ open }) => Message.Settled({ open })
      },
      view: (drawer) =>
        h.div(
          props.area
            ? drawer.swipeArea({ element: h.div.attr("id", "area") })
            : undefined,
          drawer.portal(h.dialog)?.children(
            drawer.backdrop(h.div.attr("id", "backdrop")),
            drawer.viewport(h.div.attr("id", "viewport")).children(
              drawer.popup(h.div.attr("id", "popup")).children(
                h.p.attr("id", "handle").children("Handle"),
                drawer.content(h.div.attr("id", "content")).children("Text"),
                h.button.attr("id", "button").children("Go"),
                h.input.attr("id", "field"),
                props.scroll
                  ? h.div.attrs({ id: "scroller", style: "overflow-y:auto" })
                    .children("Long")
                  : undefined
              )
            )
          )
        )
    })
    return props.provider
      ? DrawerProvider(h, {
        view: (provider) =>
          h.div(
            provider.indentBackground(h.div),
            provider.indent(h.div.attr("id", "indent")),
            drawer
          )
      })
      : drawer
  }
})

let time = 100
const pointer = (
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  buttons = 1
) => {
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

const drag = (
  target: Element,
  from: [number, number],
  to: [number, number],
  steps = 4
) => {
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
  Object.defineProperty(element, "offsetWidth", {
    configurable: true,
    value: width
  })
  Object.defineProperty(element, "offsetHeight", {
    configurable: true,
    value: height
  })
}

const touch = (target: Element, type: string, x: number, y: number) => {
  time += 16
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
    composed: true
  })
  const points = type === "touchend" || type === "touchcancel"
    ? []
    : [{ clientX: x, clientY: y, identifier: 1, target }]
  Object.defineProperty(event, "touches", { value: points })
  Object.defineProperty(event, "timeStamp", { value: time })
  target.dispatchEvent(event)
  return event
}

const swipeTouch = (
  target: Element,
  from: [number, number],
  to: [number, number],
  steps = 4
) => {
  touch(target, "touchstart", from[0], from[1])
  const moves: Array<Event> = []
  for (let i = 1; i <= steps; i++) {
    moves.push(
      touch(
        target,
        "touchmove",
        from[0] + (to[0] - from[0]) * i / steps,
        from[1] + (to[1] - from[1]) * i / steps
      )
    )
  }
  return moves
}

const movement = () =>
  popup().style.getPropertyValue("--drawer-swipe-movement-y")

const mount = Effect.fnUntraced(function*(overrides: Partial<Config>) {
  yield* popovers
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, config(overrides), app)
  yield* tick
  return root
})

const popup = () => document.querySelector<HTMLElement>("[data-drawer-popup]")!

describe("Drawer in a document", { concurrent: false }, () => {
  it.effect("writes movement during a drag, settles on a short or reversed release, and dismisses on a long release", () =>
    Effect.gen(function*() {
      const root = yield* mount({})
      sized(popup(), 300, 200)
      const handle = document.getElementById("handle")!

      drag(handle, [10, 10], [10, 30], 20)
      pointer(document, "pointerup", 10, 30, 0)
      yield* tick
      assert.notInclude(root.model()!.events, "RequestedClose:swipe")
      assert.strictEqual(movement(), "0px")
      assert.strictEqual(popup().style.getPropertyValue("transition"), "")
      assert.isUndefined(popup().getAttributeNode("data-swiping") ?? undefined)

      drag(handle, [10, 10], [10, 90], 2)
      pointer(document, "pointermove", 10, 60)
      pointer(document, "pointerup", 10, 60, 0)
      yield* tick
      assert.notInclude(root.model()!.events, "RequestedClose:swipe")
      assert.isTrue(root.model()!.open)

      drag(handle, [10, 10], [10, 150])
      assert.strictEqual(
        popup().style.getPropertyValue("--drawer-swipe-movement-y"),
        "140px"
      )
      assert.strictEqual(popup().style.getPropertyValue("transition"), "none")
      yield* tick
      assert.strictEqual(popup().getAttribute("data-swiping"), "")
      pointer(document, "pointerup", 10, 150, 0)
      yield* tick
      assert.include(root.model()!.events, "RequestedClose:swipe")
      assert.strictEqual(popup()?.getAttribute("data-swipe-dismiss") ?? "", "")
      assert.isFalse(root.model()!.open)
    }))

  it.effect("a close during a swipe ends the swipe, and the popup is inert through its exit", () =>
    Effect.gen(function*() {
      yield* holdExits
      const root = yield* mount({})
      sized(popup(), 300, 200)
      assert.strictEqual(document.activeElement?.id, "button")
      drag(document.getElementById("handle")!, [10, 10], [10, 40])
      yield* tick
      assert.strictEqual(popup().getAttribute("data-swiping"), "")
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true
        })
      )
      yield* tick
      assert.include(root.model()!.events, "RequestedClose:escape-key")
      assert.notInclude(root.model()!.events, "Settled:false")
      assert.isNull(popup().getAttribute("data-swiping"))
      assert.strictEqual(movement(), "0px")
      assert.strictEqual(popup().getAttribute("inert"), "")
      assert.notStrictEqual(document.activeElement?.id, "button")
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
      assert.notInclude(root.model()!.events, "RequestedClose:swipe")
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
      assert.include(root.model()!.events, "RequestedClose:swipe")
      assert.isTrue(root.model()!.open)
      assert.strictEqual(movement(), "0px")
      assert.isNull(popup().getAttribute("data-swipe-dismiss"))
    }))

  it.effect("claims a touch with nothing to scroll, lets a scrolled list scroll, and hands off at its top edge", () =>
    Effect.gen(function*() {
      const root = yield* mount({ scroll: true })
      sized(popup(), 300, 400)
      const scroller = document.getElementById("scroller")!
      Object.defineProperty(scroller, "scrollHeight", {
        configurable: true,
        value: 1000
      })
      Object.defineProperty(scroller, "clientHeight", {
        configurable: true,
        value: 200
      })
      scroller.scrollTop = 100
      const scrolling = swipeTouch(scroller, [10, 10], [10, 150])
      assert.isFalse(scrolling.some((event) => event.defaultPrevented))
      touch(scroller, "touchend", 10, 150)
      assert.strictEqual(movement(), "0px")

      const handle = document.getElementById("handle")!
      const claimed = swipeTouch(handle, [10, 10], [10, 50], 10)
      assert.isTrue(claimed.every((event) => event.defaultPrevented))
      assert.strictEqual(movement(), "40px")
      touch(handle, "touchend", 10, 50)
      yield* tick
      scroller.scrollTop = 0
      const swiping = swipeTouch(scroller, [10, 10], [10, 250])
      assert.isTrue(swiping.every((event) => event.defaultPrevented))
      assert.strictEqual(movement(), "180px")
      touch(scroller, "touchend", 10, 250)
      yield* tick
      assert.include(root.model()!.events, "RequestedClose:swipe")
    }))

  it.effect("opens from a swipe area, closes if released short, and stays open on a long swipe without its click dismissing", () =>
    Effect.gen(function*() {
      const root = yield* mount({ open: false, area: true, modal: false })
      const area = document.getElementById("area")!
      assert.strictEqual(area.getAttribute("data-swipe-direction"), "up")
      assert.include(area.getAttribute("style") ?? "", "touch-action:pan-x")
      pointer(area, "pointerdown", 10, 500)
      pointer(document, "pointermove", 10, 495)
      yield* tick
      sized(popup(), 300, 200)
      time += 200
      pointer(document, "pointermove", 10, 480)
      time += 200
      pointer(document, "pointerup", 10, 480, 0)
      yield* tick
      assert.include(root.model()!.events, "RequestedClose:swipe")
      assert.isFalse(root.model()!.open)

      pointer(area, "pointerdown", 10, 500)
      pointer(document, "pointermove", 10, 495)
      yield* tick
      assert.deepStrictEqual(root.model()!.events.slice(0, 1), [
        "RequestedOpen:swipe"
      ])
      sized(popup(), 300, 200)
      pointer(document, "pointermove", 10, 400)
      assert.strictEqual(movement(), "100px")
      assert.strictEqual(popup().style.getPropertyValue("transition"), "none")
      pointer(document, "pointerup", 10, 380, 0)
      area.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
      yield* tick
      assert.isTrue(root.model()!.open)
      assert.notInclude(root.model()!.events, "RequestedClose:outside-press")
      assert.strictEqual(movement(), "0px")
      assert.strictEqual(popup().style.getPropertyValue("transition"), "")
      pointer(area, "pointerdown", 10, 500)
      pointer(area, "pointerup", 10, 500, 0)
      area.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
      yield* tick
      assert.include(root.model()!.events, "RequestedClose:outside-press")
      assert.isFalse(root.model()!.open)
    }))

  it.effect("scales the indent while a swipe runs and puts it back to 0", () =>
    Effect.gen(function*() {
      yield* mount({ provider: true })
      const indent = document.getElementById("indent")!
      assert.strictEqual(indent.getAttribute("data-active"), "")
      assert.strictEqual(
        indent.style.getPropertyValue("--drawer-swipe-progress"),
        "0"
      )
      sized(popup(), 300, 200)
      drag(document.getElementById("handle")!, [10, 10], [10, 60])
      assert.strictEqual(
        indent.style.getPropertyValue("--drawer-swipe-progress"),
        "0.25"
      )
      assert.strictEqual(
        indent.style.getPropertyValue("--drawer-height"),
        "200px"
      )
      const backdrop = document.querySelector<HTMLElement>(
        "[data-drawer-backdrop]"
      )!
      assert.strictEqual(
        backdrop.style.getPropertyValue("--drawer-swipe-progress"),
        "0.25"
      )
      pointer(document, "pointerup", 10, 60, 0)
      yield* tick
      assert.strictEqual(
        indent.style.getPropertyValue("--drawer-swipe-progress"),
        "0"
      )
      assert.strictEqual(indent.style.getPropertyValue("--drawer-height"), "")
      assert.strictEqual(
        backdrop.style.getPropertyValue("--drawer-swipe-progress"),
        "0"
      )
    }))

  it.effect("rests the indent at the backdrop's progress at a lower snap point, and at 0 once closed", () =>
    Effect.gen(function*() {
      const root = yield* mount({ provider: true, snapPoints: [0.5, 1] })
      const indent = document.getElementById("indent")!
      const backdrop = document.querySelector<HTMLElement>(
        "[data-drawer-backdrop]"
      )!
      sized(popup(), 300, 800)
      document.querySelectorAll("[role=presentation]").forEach((element) =>
        sized(element, 300, 800)
      )
      drag(document.getElementById("handle")!, [10, 10], [10, 12])
      pointer(document, "pointerup", 10, 12, 0)
      yield* tick
      assert.strictEqual(
        backdrop.style.getPropertyValue("--drawer-swipe-progress"),
        "1"
      )
      assert.strictEqual(
        indent.style.getPropertyValue("--drawer-swipe-progress"),
        "1"
      )
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
      yield* tick
      assert.isFalse(root.model()!.open)
      assert.strictEqual(
        indent.style.getPropertyValue("--drawer-swipe-progress"),
        "0"
      )
    }))

  it.effect("writes the keyboard inset on the viewport while a field has the keyboard up", () =>
    Effect.gen(function*() {
      const { visual } = yield* visualViewport
      yield* mount({ keyboard: true })
      const viewport = document.getElementById("viewport")!
      const inset = () =>
        viewport.style.getPropertyValue("--drawer-keyboard-inset")
      assert.strictEqual(inset(), "")
      document.getElementById("field")!.focus()
      visual.move({ height: 500 })
      yield* tick
      assert.strictEqual(inset(), "300px")
      document.getElementById("button")!.focus()
      yield* tick
      assert.strictEqual(inset(), "")
    }))
})
