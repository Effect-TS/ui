// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Menu, type MenuItem } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { TestClock } from "effect/testing"
import { byId, click, container, popovers, tick } from "./utils/document.ts"

type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

const rects = new Map<string, Rect>()

const geometry = Effect.acquireRelease(
  Effect.sync(() => {
    const element = window.Element.prototype as any
    const root = document.documentElement as any
    const saved = { rect: element.getBoundingClientRect, ResizeObserver: (window as any).ResizeObserver }
    ;(window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    element.getBoundingClientRect = function(this: Element) {
      const { height, width, x, y } = rects.get(this.id) ?? rects.get(this.getAttribute("data-testid") ?? "") ??
        { x: 0, y: 0, width: 0, height: 0 }
      return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height }
    }
    Object.defineProperty(root, "clientWidth", { configurable: true, value: 1000 })
    Object.defineProperty(root, "clientHeight", { configurable: true, value: 800 })
    return () => {
      element.getBoundingClientRect = saved.rect
      ;(window as any).ResizeObserver = saved.ResizeObserver
      delete root.clientWidth
      delete root.clientHeight
      rects.clear()
    }
  }),
  (restore) => Effect.sync(restore)
)

const items: ReadonlyArray<MenuItem> = [
  { value: "copy", label: "Copy" },
  { value: "cut", label: "Cut", disabled: true },
  { value: "paste", label: "Paste" },
  { value: "wrap", label: "Wrap lines" },
  { value: "small", label: "Small" },
  { value: "large", label: "Large" },
  { value: "share", label: "Share" }
]

const shareItems: ReadonlyArray<MenuItem> = [
  { value: "email", label: "Email" },
  { value: "link", label: "Copy link" }
]

const Config = Schema.Struct({
  openOnHover: Schema.Boolean,
  filter: Schema.Boolean,
  viewport: Schema.Boolean,
  closeParentOnEsc: Schema.Boolean
})
type Config = typeof Config.Type

const Message = UiSchema.TaggedEnum({
  Opened: { menu: Schema.String, reason: Schema.String, triggerId: Schema.NullOr(Schema.String) },
  Dismissed: { menu: Schema.String, reason: Schema.String },
  Picked: { menu: Schema.String, value: Schema.String, checked: Schema.optional(Schema.Boolean) },
  ChangedQuery: { query: Schema.String }
})

const Page = Component.define({
  name: "Page",
  scoped: false,
  props: Config,
  model: Schema.Struct({
    open: Schema.Boolean,
    triggerId: Schema.NullOr(Schema.String),
    share: Schema.Boolean,
    wrap: Schema.Boolean,
    size: Schema.String,
    query: Schema.String,
    log: Schema.Array(Schema.String)
  }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ open: false, triggerId: null, share: false, wrap: false, size: "small", query: "", log: [] }),
  update: {
    Opened: (model, { menu, reason, triggerId }) => ({
      ...model,
      [menu === "root" ? "open" : "share"]: true,
      triggerId: menu === "root" ? triggerId : model.triggerId,
      log: [
        ...model.log,
        menu + " Opened " + reason + (triggerId !== null && triggerId !== "trigger" ? " from " + triggerId : "")
      ]
    }),
    Dismissed: (model, { menu, reason }) => ({
      ...model,
      [menu === "root" ? "open" : "share"]: false,
      log: [...model.log, menu + " Dismissed " + reason]
    }),
    Picked: (model, { checked, menu, value }) => ({
      ...model,
      wrap: value === "wrap" ? checked === true : model.wrap,
      size: value === "small" || value === "large" ? value : model.size,
      log: [...model.log, menu + " Picked " + value + (checked === undefined ? "" : " " + checked)]
    }),
    ChangedQuery: (model, { query }) => ({ ...model, query })
  },
  view: (model, h) =>
    Menu(h, {
      props: {
        open: model.open,
        items,
        id: "menu",
        triggerId: h.props.viewport ? model.triggerId : undefined,
        openOnHover: h.props.openOnHover,
        ...(h.props.filter ? { query: model.query } : {})
      },
      onEmit: {
        Opened: ({ reason, triggerId }) => Message.Opened({ menu: "root", reason, triggerId }),
        Dismissed: ({ reason }) => Message.Dismissed({ menu: "root", reason }),
        Picked: ({ checked, value }) => Message.Picked({ menu: "root", value, checked }),
        Highlighted: () => undefined,
        ChangedQuery: ({ query }) => Message.ChangedQuery({ query }),
        Settled: () => undefined
      },
      view: (menu) =>
        h.div(
          h.button.attr("id", "before").attr("type", "button").children("Before"),
          menu.trigger(h.button.attr("id", "trigger")).children("Edit"),
          h.props.viewport
            ? menu.trigger(h.button.attr("id", "trigger-2"), { openOnHover: true, delay: 0, closeDelay: 300 })
              .children("View")
            : null,
          h.props.viewport ? menu.trigger(h.button.attr("id", "trigger-3"), { disabled: true }).children("Off") : null,
          menu.positioner(h.div.attr("id", "positioner")).children(
            menu.popup(h.div).children(
              h.props.viewport
                ? menu.viewport(h.div.attr("id", "viewport")).children(h.span.children("Content"))
                : null,
              h.props.filter ? menu.input(h.input.attr("data-testid", "input")) : null,
              menu.item(h.div.attr("data-testid", "copy"), "copy").children("Copy"),
              menu.item(h.div.attr("data-testid", "cut"), "cut").children("Cut"),
              menu.item(h.div.attr("data-testid", "paste"), "paste").children("Paste"),
              menu.separator(h.div),
              menu.checkboxItem(h.div.attr("data-testid", "wrap"), "wrap", model.wrap).children(
                menu.checkboxItemIndicator(h.span.attr("data-testid", "wrap-check"), "wrap")?.children("✓"),
                "Wrap lines"
              ),
              menu.radioGroup(h.div, model.size).children(
                menu.radioItem(h.div.attr("data-testid", "small"), "small").children("Small"),
                menu.radioItem(h.div.attr("data-testid", "large"), "large").children("Large")
              ),
              Menu(h, {
                props: {
                  open: model.share,
                  items: shareItems,
                  parentItem: "share",
                  id: "share-menu",
                  closeParentOnEsc: h.props.closeParentOnEsc
                },
                onEmit: {
                  Opened: ({ reason }) => Message.Opened({ menu: "share", reason, triggerId: null }),
                  Dismissed: ({ reason }) => Message.Dismissed({ menu: "share", reason }),
                  Picked: ({ value }) => Message.Picked({ menu: "share", value }),
                  Highlighted: () => undefined,
                  ChangedQuery: () => undefined,
                  Settled: () => undefined
                },
                view: (share) =>
                  h.div(
                    menu.item(share.submenuTrigger(h.div.attr("data-testid", "share")), "share").children("Share"),
                    share.positioner(h.div.attr("id", "share-positioner")).children(
                      share.popup(h.div).children(
                        share.item(h.div.attr("data-testid", "email"), "email").children("Email"),
                        share.item(h.div.attr("data-testid", "link"), "link").children("Copy link")
                      )
                    )
                  )
              }),
              h.props.filter ? menu.empty(h.div.attr("data-testid", "empty"))?.children("No matches") : null
            )
          ),
          h.button.attr("id", "after").attr("type", "button").children("After")
        )
    })
})

const mountPage = Effect.fnUntraced(function*(config: Partial<Config> = {}) {
  yield* popovers
  yield* geometry
  rects.set("trigger", { x: 100, y: 100, width: 80, height: 30 })
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, {
    openOnHover: false,
    filter: false,
    viewport: false,
    closeParentOnEsc: false,
    ...config
  }, app)
  yield* tick
  return { root, log: () => root.model()?.log ?? [] }
})

const item = (value: string) => document.querySelector<HTMLElement>("[data-testid=" + value + "]")!
const keydown = (target: Element, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}
const mousedown = (target: Element) => {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, isPrimary: true, pointerType: "mouse", button: 0 })
  )
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }))
}
const shown = (id: string) => byId(id).matches(":popover-open")
const popupOf = (positioner: string) => byId(positioner).querySelector<HTMLElement>("[data-menu-popup]")!

describe("Menu in a document", { concurrent: false }, () => {
  it.effect("opens from the keyboard onto the first enabled item, skips nothing on the way, and picks with Enter", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      const trigger = byId("trigger")
      trigger.focus()
      keydown(trigger, "ArrowDown")
      yield* tick
      assert.isTrue(shown("positioner"))
      assert.deepStrictEqual(log(), ["root Opened list-navigation"])
      assert.strictEqual(trigger.getAttribute("aria-expanded"), "true")
      assert.strictEqual(trigger.getAttribute("aria-controls"), "menu")
      const popup = popupOf("positioner")
      assert.strictEqual(popup.id, "menu")
      assert.strictEqual(popup.getAttribute("role"), "menu")
      assert.strictEqual(popup.getAttribute("aria-labelledby"), "trigger")
      assert.strictEqual(document.activeElement, item("copy"))
      assert.isTrue(item("copy").hasAttribute("data-highlighted"))
      keydown(item("copy"), "ArrowDown")
      yield* tick
      assert.strictEqual(document.activeElement, item("cut"))
      assert.strictEqual(item("cut").getAttribute("aria-disabled"), "true")
      keydown(item("cut"), "Enter")
      yield* tick
      assert.isTrue(shown("positioner"))
      keydown(item("cut"), "ArrowDown")
      yield* tick
      keydown(item("paste"), "Enter")
      yield* tick
      assert.deepStrictEqual(log(), ["root Opened list-navigation", "root Picked paste", "root Dismissed item-press"])
      assert.strictEqual(document.activeElement, trigger)
    }))

  it.effect("a mouse press opens it with nothing highlighted, and a click picks", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      mousedown(byId("trigger"))
      yield* tick
      assert.isTrue(shown("positioner"))
      assert.isNull(document.querySelector("[data-highlighted]"))
      assert.strictEqual(document.activeElement, popupOf("positioner"))
      click(item("copy"))
      yield* tick
      assert.deepStrictEqual(log(), ["root Opened trigger-press", "root Picked copy", "root Dismissed item-press"])
    }))

  it.effect("checkbox and radio items report their new state and keep the menu open", () =>
    Effect.gen(function*() {
      const { log, root } = yield* mountPage()
      mousedown(byId("trigger"))
      yield* tick
      assert.strictEqual(item("wrap").getAttribute("role"), "menuitemcheckbox")
      assert.strictEqual(item("wrap").getAttribute("aria-checked"), "false")
      assert.isNull(document.querySelector("[data-testid=wrap-check]"))
      click(item("wrap"))
      yield* tick
      assert.strictEqual(item("wrap").getAttribute("aria-checked"), "true")
      assert.isNotNull(document.querySelector("[data-testid=wrap-check]"))
      assert.strictEqual(item("small").getAttribute("aria-checked"), "true")
      click(item("large"))
      yield* tick
      assert.strictEqual(item("large").getAttribute("role"), "menuitemradio")
      assert.strictEqual(item("large").getAttribute("aria-checked"), "true")
      assert.strictEqual(item("small").getAttribute("aria-checked"), "false")
      assert.isTrue(shown("positioner"))
      assert.deepStrictEqual(log(), ["root Opened trigger-press", "root Picked wrap true", "root Picked large true"])
      assert.strictEqual(root.model()?.size, "large")
    }))

  it.effect("typeahead highlights the next item whose label starts with the typed text", () =>
    Effect.gen(function*() {
      yield* mountPage()
      const trigger = byId("trigger")
      keydown(trigger, "ArrowDown")
      yield* tick
      keydown(item("copy"), "s")
      yield* tick
      assert.strictEqual(document.activeElement, item("small"))
      keydown(item("small"), "s")
      yield* tick
      assert.strictEqual(document.activeElement, item("share"))
    }))

  it.effect("Escape and a press outside close it, and Tab moves focus on from the trigger", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      keydown(item("copy"), "Escape")
      yield* tick
      assert.isFalse(shown("positioner"))
      assert.strictEqual(document.activeElement, byId("trigger"))
      mousedown(byId("trigger"))
      yield* tick
      mousedown(byId("after"))
      yield* tick
      assert.isFalse(shown("positioner"))
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      keydown(item("copy"), "Tab")
      yield* tick
      assert.deepStrictEqual(log(), [
        "root Opened list-navigation",
        "root Dismissed escape-key",
        "root Opened trigger-press",
        "root Dismissed outside-press",
        "root Opened list-navigation",
        "root Dismissed focus-out"
      ])
    }))

  it.effect("a submenu opens with ArrowRight onto its first item, closes with ArrowLeft, and a pick closes both", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      keydown(item("copy"), "End")
      yield* tick
      const share = item("share")
      assert.strictEqual(document.activeElement, share)
      assert.strictEqual(share.getAttribute("aria-haspopup"), "menu")
      assert.strictEqual(share.getAttribute("aria-expanded"), "false")
      keydown(share, "ArrowRight")
      yield* tick
      assert.isTrue(shown("share-positioner"))
      assert.strictEqual(share.getAttribute("aria-expanded"), "true")
      assert.strictEqual(document.activeElement, item("email"))
      assert.strictEqual(popupOf("share-positioner").getAttribute("aria-labelledby"), share.id)
      keydown(item("email"), "ArrowLeft")
      yield* tick
      assert.isFalse(shown("share-positioner"))
      assert.isTrue(shown("positioner"))
      assert.strictEqual(document.activeElement, share)
      keydown(share, "Enter")
      yield* tick
      assert.strictEqual(document.activeElement, item("email"))
      keydown(item("email"), "Enter")
      yield* tick
      assert.isFalse(shown("share-positioner"))
      assert.isFalse(shown("positioner"))
      assert.deepStrictEqual(log(), [
        "root Opened list-navigation",
        "share Opened list-navigation",
        "share Dismissed list-navigation",
        "share Opened trigger-press",
        "root Dismissed item-press",
        "share Picked email",
        "share Dismissed item-press"
      ])
    }))

  it.effect("a submenu closes when its parent highlights another item", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      keydown(item("copy"), "End")
      yield* tick
      keydown(item("share"), "ArrowRight")
      yield* tick
      item("paste").dispatchEvent(new MouseEvent("mouseenter"))
      yield* tick
      assert.isFalse(shown("share-positioner"))
      assert.deepStrictEqual(log().slice(-1), ["share Dismissed sibling-open"])
    }))

  it.effect("openOnHover opens it once the pointer rests on the trigger, and closes it when the pointer leaves", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ openOnHover: true })
      byId("trigger").dispatchEvent(new MouseEvent("mouseenter"))
      yield* TestClock.adjust("100 millis")
      yield* tick
      assert.isTrue(shown("positioner"))
      document.body.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 900, clientY: 700 }))
      yield* tick
      assert.isFalse(shown("positioner"))
      assert.deepStrictEqual(log(), ["root Opened trigger-hover", "root Dismissed trigger-hover"])
    }))

  it.effect("filtering keeps focus in the input, hides what doesn't match, and Enter picks the highlighted item", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ filter: true })
      mousedown(byId("trigger"))
      yield* tick
      const input = item("input") as HTMLInputElement
      assert.strictEqual(document.activeElement, input)
      assert.strictEqual(popupOf("positioner").getAttribute("role"), "presentation")
      input.value = "pa"
      input.dispatchEvent(new Event("input", { bubbles: true }))
      yield* tick
      assert.isTrue(item("copy").hidden)
      assert.isFalse(item("paste").hidden)
      assert.isTrue(keydown(input, "ArrowDown").defaultPrevented)
      yield* tick
      assert.strictEqual(document.activeElement, input)
      assert.strictEqual(input.getAttribute("aria-activedescendant"), item("paste").id)
      input.value = "zz"
      input.dispatchEvent(new Event("input", { bubbles: true }))
      yield* tick
      assert.isNotNull(document.querySelector("[data-testid=empty]"))
      input.value = "pas"
      input.dispatchEvent(new Event("input", { bubbles: true }))
      yield* tick
      keydown(input, "ArrowDown")
      yield* tick
      keydown(input, "Enter")
      yield* tick
      assert.deepStrictEqual(log(), ["root Opened trigger-press", "root Picked paste", "root Dismissed item-press"])
    }))

  it.effect("a press held on the trigger and released over an item picks it, once 200ms have passed", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      mousedown(byId("trigger"))
      yield* tick
      item("copy").dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }))
      yield* tick
      assert.isTrue(shown("positioner"))
      mousedown(byId("trigger"))
      yield* tick
      mousedown(byId("trigger"))
      yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 250)))
      item("paste").dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }))
      yield* tick
      assert.isFalse(shown("positioner"))
      assert.deepStrictEqual(log(), [
        "root Opened trigger-press",
        "root Dismissed trigger-press",
        "root Opened trigger-press",
        "root Picked paste",
        "root Dismissed item-press"
      ])
    }))

  it.effect("a release away from the trigger and the popup cancels the open", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      mousedown(byId("trigger"))
      yield* tick
      byId("after").dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: 900, clientY: 700 }))
      yield* tick
      assert.isFalse(shown("positioner"))
      assert.deepStrictEqual(log(), ["root Opened trigger-press", "root Dismissed cancel-open"])
    }))

  it.effect("a modal menu blocks the page behind it but for a cut-out around the trigger", () =>
    Effect.gen(function*() {
      yield* mountPage()
      mousedown(byId("trigger"))
      yield* tick
      const blocker = byId("positioner").querySelector<HTMLElement>("[data-menu-blocker]")!
      assert.isNotNull(blocker)
      assert.include(blocker.style.getPropertyValue("clip-path"), "100px 100px")
      assert.strictEqual(document.body.style.overflowY, "hidden")
      keydown(item("copy"), "Escape")
      yield* tick
      assert.strictEqual(document.body.style.overflowY, "")
    }))

  it.effect("Escape in a submenu closes only it, or the whole menu with closeParentOnEsc", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ closeParentOnEsc: true })
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      keydown(item("copy"), "End")
      yield* tick
      keydown(item("share"), "ArrowRight")
      yield* tick
      keydown(item("email"), "Escape")
      yield* tick
      assert.isFalse(shown("share-positioner"))
      assert.isFalse(shown("positioner"))
      assert.strictEqual(document.activeElement, byId("trigger"))
      assert.deepStrictEqual(log().slice(-2), ["root Dismissed escape-key", "share Dismissed escape-key"])
    }))

  it.effect("the viewport keeps the previous content while the popup moves to another trigger", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ viewport: true })
      rects.set("trigger-2", { x: 300, y: 100, width: 80, height: 30 })
      mousedown(byId("trigger"))
      yield* tick
      const viewport = byId("viewport")
      assert.strictEqual(viewport.children.length, 1)
      assert.isTrue(viewport.children[0]!.hasAttribute("data-current"))
      mousedown(byId("trigger-2"))
      yield* tick
      assert.deepStrictEqual(log(), ["root Opened trigger-press", "root Opened trigger-press from trigger-2"])
      assert.strictEqual(byId("trigger-2").getAttribute("aria-expanded"), "true")
      assert.strictEqual(byId("trigger").getAttribute("aria-expanded"), "false")
      assert.strictEqual(viewport.getAttribute("data-activation-direction"), "right ")
      assert.strictEqual(byId("positioner").getAttribute("data-instant"), "trigger-change")
      assert.isNull(viewport.querySelector("[data-previous]"))
      assert.isFalse(viewport.hasAttribute("data-transitioning"))
      assert.strictEqual(viewport.querySelectorAll("[data-current]").length, 1)
      assert.strictEqual(viewport.textContent, "Content")
      keydown(popupOf("positioner"), "ArrowDown")
      yield* tick
      assert.strictEqual(viewport.textContent, "Content")
    }))

  it.effect("each trigger has its own hover settings, and hovering another trigger moves an open menu to it", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ viewport: true })
      byId("trigger").dispatchEvent(new MouseEvent("mouseenter"))
      yield* TestClock.adjust("200 millis")
      yield* tick
      mousedown(byId("trigger-3"))
      yield* tick
      assert.isFalse(shown("positioner"))
      assert.isTrue(byId("trigger-3").hasAttribute("disabled"))
      mousedown(byId("trigger"))
      yield* tick
      byId("trigger-2").dispatchEvent(new MouseEvent("mouseenter"))
      yield* tick
      assert.strictEqual(byId("trigger-2").getAttribute("aria-expanded"), "true")
      document.body.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 900, clientY: 700 }))
      yield* TestClock.adjust("200 millis")
      yield* tick
      assert.isTrue(shown("positioner"))
      yield* TestClock.adjust("100 millis")
      yield* tick
      assert.isFalse(shown("positioner"))
      assert.deepStrictEqual(log(), [
        "root Opened trigger-press",
        "root Opened trigger-hover from trigger-2",
        "root Dismissed trigger-hover"
      ])
    }))

  it.effect("hovering a submenu trigger opens it, and the pointer can cross to it through the safe triangle", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      rects.set("share", { x: 100, y: 100, width: 80, height: 30 })
      rects.set("share-positioner", { x: 300, y: 80, width: 150, height: 100 })
      mousedown(byId("trigger"))
      yield* tick
      const share = item("share")
      share.dispatchEvent(new MouseEvent("mouseenter"))
      yield* TestClock.adjust("100 millis")
      yield* tick
      assert.isTrue(shown("share-positioner"))
      assert.strictEqual(document.activeElement, share)
      share.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, clientX: 180, clientY: 115 }))
      document.body.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 250, clientY: 120 }))
      yield* TestClock.adjust("10 millis")
      yield* tick
      assert.isTrue(shown("share-positioner"))
      assert.strictEqual(popupOf("positioner").style.pointerEvents, "none")
      item("paste").dispatchEvent(new MouseEvent("mouseenter", { clientX: 250, clientY: 120 }))
      yield* tick
      assert.isFalse(item("paste").hasAttribute("data-highlighted"))
      assert.isTrue(shown("share-positioner"))
      item("email").dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 320, clientY: 100 }))
      yield* tick
      assert.strictEqual(popupOf("positioner").style.pointerEvents, "")
      document.body.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 900, clientY: 700 }))
      yield* TestClock.adjust("10 millis")
      yield* tick
      assert.isFalse(shown("share-positioner"))
      assert.isTrue(shown("positioner"))
      assert.deepStrictEqual(log(), [
        "root Opened trigger-press",
        "share Opened trigger-hover",
        "share Dismissed trigger-hover"
      ])
    }))
})
