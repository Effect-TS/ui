// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Dialog, Field, Select } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, container, popovers, press, tick } from "./utils/document.ts"

type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

const rects = new Map<string, Rect>()
const positionerSize = { width: 200, height: 150 }

const rectOf = (element: Element): Rect => {
  const style = (element as HTMLElement).style
  if (element.id === "positioner") {
    return {
      x: parseFloat(style?.left) || 0,
      y: parseFloat(style?.top) || 0,
      width: positionerSize.width,
      height: parseFloat(style?.height) || positionerSize.height
    }
  }
  const key = element.getAttribute("data-geo")
  if (key?.startsWith("text-")) {
    const positioner = rectOf(byId("positioner"))
    const index = items.findIndex(({ value }) => "text-" + value === key)
    return { x: positioner.x + 8, y: positioner.y + 10 + index * 30, width: 80, height: 20 }
  }
  return rects.get(element.id || key || "") ?? { x: 0, y: 0, width: 0, height: 0 }
}

class StillResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
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
      ResizeObserver: (window as any).ResizeObserver
    }
    ;(window as any).ResizeObserver = StillResizeObserver
    element.getBoundingClientRect = function(this: Element) {
      const { height, width, x, y } = rectOf(this)
      return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height }
    }
    Object.defineProperty(html, "offsetWidth", {
      configurable: true,
      get: function(this: Element) {
        return rectOf(this).width
      }
    })
    Object.defineProperty(html, "offsetHeight", {
      configurable: true,
      get: function(this: Element) {
        return rectOf(this).height
      }
    })
    Object.defineProperty(root, "clientWidth", { configurable: true, value: 1000 })
    Object.defineProperty(root, "clientHeight", { configurable: true, value: 800 })
    return () => {
      element.getBoundingClientRect = saved.rect
      Object.defineProperty(html, "offsetWidth", saved.offsetWidth!)
      Object.defineProperty(html, "offsetHeight", saved.offsetHeight!)
      ;(window as any).ResizeObserver = saved.ResizeObserver
      delete root.clientWidth
      delete root.clientHeight
      rects.clear()
    }
  }),
  (restore) => Effect.sync(restore)
)

const items = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" }
]

const Config = Schema.Struct({
  align: Schema.Boolean,
  required: Schema.Boolean,
  dialog: Schema.Boolean
})
type Config = typeof Config.Type

const Message = UiSchema.TaggedEnum({
  Opened: { reason: Schema.String },
  Dismissed: { reason: Schema.String },
  Picked: { value: Schema.NullOr(Schema.String) },
  DismissedDialog: { reason: Schema.String }
})

const Page = Component.define({
  name: "Page",
  props: Config,
  model: Schema.Struct({
    open: Schema.Boolean,
    value: Schema.NullOr(Schema.String),
    log: Schema.Array(Schema.String)
  }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ open: false, value: null, log: [] }),
  update: {
    Opened: (model, { reason }) => ({ ...model, open: true, log: [...model.log, "Opened " + reason] }),
    Dismissed: (model, { reason }) => ({ ...model, open: false, log: [...model.log, "Dismissed " + reason] }),
    Picked: (model, { value }) => ({ ...model, value, log: [...model.log, "Picked " + value] }),
    DismissedDialog: (model, { reason }) => ({ ...model, log: [...model.log, "DismissedDialog " + reason] })
  },
  view: (model, h) => {
    const select = Field(h, {
      props: {},
      view: (field) =>
        Select(h, {
          props: {
            open: model.open,
            value: model.value,
            items,
            id: "trigger",
            name: "theme",
            required: h.props.required,
            alignItemWithTrigger: h.props.align
          },
          onEmit: {
            Opened: ({ reason }) => Message.Opened({ reason }),
            Dismissed: ({ reason }) => Message.Dismissed({ reason }),
            Picked: ({ value }) => Message.Picked({ value: typeof value === "string" ? value : null }),
            Settled: () => undefined
          },
          view: (select) =>
            field.root(h.div.attr("id", "field")).children(
              select.label(h.div.attr("id", "label")).children("Theme"),
              field.focusWithin(h.div).children(
                select.trigger(field.member(h.button)).children(select.value(h.span.attr("data-geo", "value"))),
                select.positioner(h.div.attr("id", "positioner")).children(
                  select.popup(h.div.class("popup")).children(
                    ...items.map(({ label, value }) =>
                      select.item(h.div.attr("data-testid", value), value).children(
                        select.itemText(h.div.attr("data-geo", "text-" + value)).children(label)
                      )
                    )
                  )
                )
              )
            )
        })
    })
    const form = h.form.attr("id", "form").children(
      h.button.attr("id", "before").attr("type", "button").children("Before"),
      select,
      h.button.attr("id", "after").attr("type", "button").children("After")
    )
    return h.props.dialog
      ? Dialog(h, {
        props: { open: true },
        onEmit: {
          Opened: () => undefined,
          Dismissed: ({ reason }) => Message.DismissedDialog({ reason }),
          Settled: () => undefined
        },
        view: (dialog) => h.div(dialog.portal(h.dialog)?.children(dialog.popup(h.div).children(form)))
      })
      : form
  }
})

const mountPage = Effect.fnUntraced(function*(config: Partial<Config> = {}) {
  yield* popovers
  yield* geometry
  rects.set("trigger", rects.get("trigger") ?? { x: 100, y: 300, width: 120, height: 30 })
  rects.set("value", { x: 110, y: 305, width: 60, height: 20 })
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, { align: false, required: false, dialog: false, ...config }, app)
  yield* tick
  return { root, log: () => root.model()?.log ?? [] }
})

const style = (name: string) => byId("positioner").style.getPropertyValue(name)
const item = (value: string) => document.querySelector<HTMLElement>("[data-testid=" + value + "]")!
const keydown = (target: Element, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}
const keyup = (target: Element, key: string) =>
  target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }))
const mousedown = (target: Element) =>
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }))
const shown = () => byId("positioner").matches(":popover-open")
const reveals = Effect.acquireRelease(
  Effect.sync(() => {
    const element = window.Element.prototype as any
    const saved = element.scrollIntoView
    const seen: Array<string> = []
    element.scrollIntoView = function(this: Element) {
      seen.push(this.getAttribute("data-testid") + " with the popup at " + style("top"))
    }
    return { seen, restore: () => (element.scrollIntoView = saved) }
  }),
  ({ restore }) => Effect.sync(restore)
).pipe(Effect.map(({ seen }) => seen))
const touched = () => byId("field").hasAttribute("data-touched")

describe("Select in a document", { concurrent: false }, () => {
  it.effect("places the popup below the trigger, flips it near the bottom, and reports the side", () =>
    Effect.gen(function*() {
      const revealed = yield* reveals
      const { root } = yield* mountPage()
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      assert.isTrue(shown())
      assert.strictEqual(style("left"), "60px")
      assert.strictEqual(style("top"), "330px")
      assert.deepStrictEqual(revealed, ["light with the popup at 330px"])
      assert.strictEqual(style("--anchor-width"), "120px")
      assert.strictEqual(byId("positioner").getAttribute("data-side"), "bottom")
      assert.strictEqual(byId("trigger").getAttribute("data-popup-side"), "bottom")
      root.send(Message.Dismissed({ reason: "test" }))
      yield* tick
      rects.set("trigger", { x: 100, y: 700, width: 120, height: 30 })
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      assert.strictEqual(style("top"), "550px")
      assert.strictEqual(byId("positioner").getAttribute("data-side"), "top")
    }).pipe(Effect.scoped))

  it.effect("aligned with the trigger, the selected item's text is over the value, inside the CSS margins", () =>
    Effect.gen(function*() {
      const { root } = yield* mountPage({ align: true })
      root.send(Message.Picked({ value: "dark" }))
      yield* tick
      mousedown(byId("trigger"))
      yield* tick
      assert.isTrue(shown())
      assert.strictEqual(byId("positioner").getAttribute("data-side"), "none")
      assert.strictEqual(style("left"), "102px")
      assert.strictEqual(style("top"), "255px")
      assert.strictEqual(style("height"), "150px")
      assert.strictEqual(style("max-height"), "none")
      assert.strictEqual(style("--anchor-width"), "120px")
      document.dispatchEvent(new Event("scroll"))
      yield* tick
      assert.strictEqual(style("left"), "102px")
      assert.strictEqual(style("top"), "255px")
      assert.strictEqual(document.activeElement, item("dark"))
      root.send(Message.Dismissed({ reason: "test" }))
      yield* tick
      const margins = document.head.appendChild(document.createElement("style"))
      margins.textContent = "#positioner { margin-top: 30px; margin-bottom: 50px }"
      yield* Effect.addFinalizer(() => Effect.sync(() => margins.remove()))
      mousedown(byId("trigger"))
      yield* tick
      assert.strictEqual(style("top"), "235px")
    }).pipe(Effect.scoped))

  it.effect("falls back to placing the popup below a trigger near the top of the viewport", () =>
    Effect.gen(function*() {
      rects.set("trigger", { x: 100, y: 10, width: 120, height: 30 })
      const revealed = yield* reveals
      const { root } = yield* mountPage({ align: true })
      root.send(Message.Picked({ value: "dark" }))
      yield* tick
      mousedown(byId("trigger"))
      yield* tick
      assert.strictEqual(byId("positioner").getAttribute("data-side"), "bottom")
      assert.strictEqual(style("left"), "60px")
      assert.strictEqual(style("top"), "40px")
      assert.strictEqual(style("height"), "")
      assert.deepStrictEqual(revealed, ["dark with the popup at 40px"])
      const blocker = byId("positioner").querySelector<HTMLElement>("[data-select-blocker]")!
      assert.include(blocker.style.getPropertyValue("clip-path"), "100px 10px")
    }).pipe(Effect.scoped))

  it.effect("aligned from the bottom after a fallback, it drops the top the fallback left", () =>
    Effect.gen(function*() {
      rects.set("trigger", { x: 100, y: 10, width: 120, height: 30 })
      const { root } = yield* mountPage({ align: true })
      mousedown(byId("trigger"))
      yield* tick
      assert.strictEqual(style("top"), "40px")
      root.send(Message.Dismissed({ reason: "test" }))
      yield* tick
      rects.set("trigger", { x: 100, y: 300, width: 120, height: 30 })
      const html = window.HTMLElement.prototype as any
      const sized = (size: number) => ({
        configurable: true,
        get(this: Element) {
          return this.classList.contains("popup") ? size : 0
        }
      })
      Object.defineProperty(html, "scrollHeight", sized(400))
      Object.defineProperty(html, "clientHeight", sized(150))
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          delete html.scrollHeight
          delete html.clientHeight
        })
      )
      mousedown(byId("trigger"))
      yield* tick
      assert.strictEqual(byId("positioner").getAttribute("data-side"), "none")
      assert.strictEqual(style("bottom"), "0px")
      assert.strictEqual(style("top"), "auto")
    }).pipe(Effect.scoped))

  it.effect("moves focus into the items, and back to the trigger before it hides, so the field isn't touched", () =>
    Effect.gen(function*() {
      const scrolled = yield* reveals
      const { log } = yield* mountPage()
      byId(byId("trigger").getAttribute("aria-labelledby")!).click()
      yield* tick
      assert.strictEqual(document.activeElement, byId("trigger"))
      assert.isFalse(shown())
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      assert.strictEqual(document.activeElement, item("light"))
      assert.strictEqual(item("light").tabIndex, 0)
      scrolled.length = 0
      keydown(item("light"), "ArrowDown")
      yield* tick
      assert.strictEqual(document.activeElement, item("dark"))
      assert.deepStrictEqual(scrolled, ["dark with the popup at 330px"])
      scrolled.length = 0
      item("system").dispatchEvent(new MouseEvent("mouseenter"))
      yield* tick
      assert.strictEqual(document.activeElement, item("system"))
      assert.deepStrictEqual(scrolled, [])
      const escape = keydown(item("system"), "Escape")
      assert.isTrue(escape.defaultPrevented)
      yield* tick
      assert.strictEqual(document.activeElement, byId("trigger"))
      assert.isFalse(shown())
      assert.isFalse(touched())
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      keydown(item("light"), "ArrowDown")
      yield* tick
      keydown(item("dark"), "Enter")
      yield* tick
      assert.strictEqual(document.activeElement, byId("trigger"))
      assert.strictEqual(byId("trigger").textContent, "Dark")
      assert.isFalse(touched())
      assert.deepStrictEqual(log(), [
        "Opened list-navigation",
        "Dismissed escape-key",
        "Opened list-navigation",
        "Picked dark",
        "Dismissed item-press"
      ])
    }).pipe(Effect.scoped))

  it.effect("Space picks on keyup, so the trigger doesn't open again", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      keydown(item("light"), " ")
      keyup(item("light"), " ")
      yield* tick
      assert.strictEqual(document.activeElement, byId("trigger"))
      keyup(byId("trigger"), " ")
      yield* tick
      assert.deepStrictEqual(log(), ["Opened list-navigation", "Picked light", "Dismissed item-press"])
    }).pipe(Effect.scoped))

  it.effect("focus leaving closes it and touches the field, and a press outside closes it, but not on a scrollbar", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      byId("after").focus()
      yield* tick
      assert.isFalse(shown())
      assert.strictEqual(document.activeElement, byId("after"))
      assert.isTrue(touched())
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      const page = document.documentElement
      Object.defineProperty(page, "scrollHeight", { configurable: true, value: 2000 })
      yield* Effect.addFinalizer(() => Effect.sync(() => delete (page as any).scrollHeight))
      const pressPage = (offsetX: number) => {
        const event = new PointerEvent("pointerdown", {
          bubbles: true,
          isPrimary: true,
          pointerType: "mouse",
          button: 0
        })
        Object.defineProperty(event, "offsetX", { value: offsetX })
        page.dispatchEvent(event)
      }
      pressPage(1005)
      yield* tick
      assert.isTrue(shown())
      pressPage(500)
      yield* tick
      assert.isFalse(shown())
      assert.deepStrictEqual(log(), [
        "Opened list-navigation",
        "Dismissed focus-out",
        "Opened list-navigation",
        "Dismissed outside-press"
      ])
    }).pipe(Effect.scoped))

  it.effect("a press on the modal backdrop keeps focus, so only leaving touches the field", () =>
    Effect.gen(function*() {
      yield* mountPage()
      const popup = document.querySelector(".popup")
      byId("trigger").focus()
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      assert.strictEqual(document.querySelector(".popup"), popup)
      assert.strictEqual(document.body.style.overflowY, "hidden")
      const blocker = byId("positioner").querySelector("[data-select-blocker]")!
      assert.isNotNull(blocker)
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })
      blocker.dispatchEvent(down)
      assert.isTrue(down.defaultPrevented)
      press(blocker)
      yield* tick
      assert.isFalse(shown())
      assert.strictEqual(document.body.style.overflowY, "")
      assert.strictEqual(document.activeElement, byId("trigger"))
      assert.isFalse(touched())
    }).pipe(Effect.scoped))

  it.effect("in a modal dialog, Escape closes only the select", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ dialog: true })
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      keydown(item("light"), "Escape")
      yield* tick
      press(item("dark"))
      yield* tick
      assert.deepStrictEqual(log(), ["Opened list-navigation", "Dismissed escape-key"])
      assert.strictEqual(document.activeElement, byId("trigger"))
    }).pipe(Effect.scoped))

  it.effect("a required select blocks its form until it has a value, and submits it", () =>
    Effect.gen(function*() {
      const { root } = yield* mountPage({ required: true })
      const form = byId("form") as HTMLFormElement
      const input = form.querySelector("input")!
      assert.strictEqual(byId("trigger").parentElement, input.parentElement)
      assert.strictEqual(input.parentElement!.style.display, "contents")
      assert.isFalse(form.checkValidity())
      root.send(Message.Picked({ value: "system" }))
      yield* tick
      assert.isTrue(form.checkValidity())
      assert.strictEqual(new FormData(form).get("theme"), "system")
      input.focus()
      yield* tick
      assert.strictEqual(document.activeElement, byId("trigger"))
    }).pipe(Effect.scoped))
})
