// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { PreviewCard, PreviewCardTrigger } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { TestClock } from "effect/testing"
import { byId, container, focusVisibility, holdExits, popovers, press, tick } from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({
  Opened: { triggerId: Schema.NullOr(Schema.String), reason: Schema.String },
  Dismissed: { reason: Schema.String },
  RemovedB: {}
})

const Page = Component.define({
  name: "Page",
  scoped: false,
  model: Schema.Struct({
    open: Schema.Boolean,
    triggerId: Schema.NullOr(Schema.String),
    showB: Schema.Boolean,
    log: Schema.Array(Schema.String)
  }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ open: false, triggerId: null, showB: true, log: [] }),
  update: {
    Opened: (model, { reason, triggerId }) => ({
      ...model,
      open: true,
      triggerId,
      log: [...model.log, `Opened ${triggerId} ${reason}`]
    }),
    Dismissed: (model, { reason }) => ({ ...model, open: false, log: [...model.log, `Dismissed ${reason}`] }),
    RemovedB: (model) => ({ ...model, showB: false })
  },
  view: (model, h) =>
    h.div(
      h.button.attr("id", "outside").onClick(Message.RemovedB()).children("Outside"),
      PreviewCard(h, {
        props: { open: model.open, triggerId: model.triggerId, id: "card", sideOffset: 8 },
        onEmit: {
          Opened: ({ reason, triggerId }) => Message.Opened({ triggerId, reason }),
          Dismissed: ({ reason }) => Message.Dismissed({ reason }),
          Settled: () => undefined
        },
        view: (previewCard) =>
          h.p(
            previewCard.trigger({ element: h.a.attr("id", "a").attr("href", "/a"), delay: 0, closeDelay: 0 })
              .children("A"),
            model.showB
              ? previewCard.trigger({ element: h.a.attr("id", "b").attr("href", "/b"), delay: 0, closeDelay: 0 })
                .children("B")
              : null,
            previewCard.trigger({ element: h.a.attr("id", "wrapped").attr("href", "/w"), delay: 100 })
              .children("A link that wraps"),
            previewCard.portal(h.div)?.children(
              previewCard.positioner(h.div.attr("data-positioner", "")).children(
                previewCard.popup(h.div.attr("data-popup", "")).children(
                  h.a.attr("id", "inner").attr("href", "/inner").children(`More on ${model.triggerId}`)
                )
              )
            )
          )
      }),
      PreviewCardTrigger(h, {
        element: h.a.attr("id", "detached").attr("href", "/detached"),
        props: { open: model.open && model.triggerId === "detached", popupId: "card", delay: 0, closeDelay: 0 }
      }).children("Detached")
    )
})

const mountPage = Effect.fnUntraced(function*() {
  yield* popovers
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, {}, app)
  yield* tick
  return { log: () => root.model()!.log }
})

const mouse = (target: Element, type: "mouseenter" | "mouseleave" | "mousemove", clientX: number, clientY: number) =>
  target.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: type === "mousemove" }))

const part = (name: "positioner" | "popup") => document.querySelector(`[data-${name}]`)!

const box = (element: Element, x: number, y: number, width: number, height: number) => {
  element.getBoundingClientRect = () => new DOMRect(x, y, width, height)
}

describe("PreviewCard in a document", { concurrent: false }, () => {
  it.effect("a diagonal move to the card keeps it open, while leaving away closes it", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      const a = byId("a")
      box(a, 100, 100, 40, 20)
      mouse(a, "mouseenter", 130, 110)
      yield* tick
      assert.deepStrictEqual(log(), ["Opened a trigger-hover"])
      box(part("positioner"), 0, 120, 400, 200)
      mouse(a, "mouseleave", 141, 118)
      mouse(document.body, "mousemove", 145, 119.5)
      yield* tick
      assert.deepStrictEqual(log(), ["Opened a trigger-hover"])
      mouse(part("popup"), "mousemove", 300, 200)
      yield* tick
      assert.deepStrictEqual(log(), ["Opened a trigger-hover"])
      mouse(document.body, "mousemove", 600, 50)
      yield* tick
      assert.deepStrictEqual(log(), ["Opened a trigger-hover", "Dismissed trigger-hover"])

      mouse(a, "mouseenter", 130, 110)
      yield* tick
      box(part("positioner"), 0, 120, 400, 200)
      mouse(a, "mousemove", 120, 101)
      mouse(a, "mouseleave", 120, 99)
      mouse(document.body, "mousemove", 120, 90)
      yield* tick
      assert.deepStrictEqual(log().slice(2), ["Opened a trigger-hover", "Dismissed trigger-hover"])
    }))

  it.effect("keyboard focus opens it, moving focus inside holds it, and moving outside or pressing Escape closes it", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      byId("a").focus()
      yield* tick
      assert.deepStrictEqual(log(), ["Opened a trigger-focus"])
      assert.strictEqual(part("popup").getAttribute("data-instant"), "focus")
      assert.strictEqual(part("popup").getAttribute("tabindex"), "-1")
      assert.notStrictEqual(document.activeElement, part("popup"))
      byId("inner").focus()
      yield* tick
      assert.deepStrictEqual(log(), ["Opened a trigger-focus"])
      byId("outside").focus()
      yield* tick
      assert.deepStrictEqual(log(), ["Opened a trigger-focus", "Dismissed trigger-focus"])
      byId("a").focus()
      yield* tick
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      yield* tick
      assert.deepStrictEqual(log().slice(2), ["Opened a trigger-focus", "Dismissed escape-key"])
    }))

  it.effect("Escape with focus in the card gives it back to the link without opening the card, and the card is inert", () =>
    Effect.gen(function*() {
      yield* holdExits
      const calls = yield* focusVisibility
      const { log } = yield* mountPage()
      byId("a").focus()
      yield* tick
      byId("inner").focus()
      yield* tick
      assert.isNull(byId("card").getAttribute("inert"))
      byId("inner").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      yield* tick
      yield* tick
      assert.deepStrictEqual(log(), ["Opened a trigger-focus", "Dismissed escape-key"])
      assert.strictEqual(document.activeElement?.id, "a")
      assert.deepStrictEqual(calls.at(-1), ["a", true])
      assert.isTrue(byId("card").isConnected)
      assert.isTrue(byId("card").inert)
    }))

  it.effect("a press on the link keeps it open, and a press outside closes it", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      mouse(byId("a"), "mouseenter", 1, 1)
      yield* tick
      press(byId("a"))
      yield* tick
      assert.deepStrictEqual(log(), ["Opened a trigger-hover"])
      press(byId("outside"))
      yield* tick
      assert.deepStrictEqual(log(), ["Opened a trigger-hover", "Dismissed outside-press"])
    }))

  it.effect("asks to close when the link it is open for leaves the page", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      mouse(byId("b"), "mouseenter", 1, 1)
      yield* tick
      assert.strictEqual(byId("b").getAttribute("data-popup-open"), "")
      byId("outside").click()
      yield* tick
      yield* tick
      assert.deepStrictEqual(log(), ["Opened b trigger-hover", "Dismissed trigger-removed"])
    }))

  it.effect("a link drawn elsewhere opens the card it names", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      const detached = byId("detached")
      mouse(detached, "mouseenter", 1, 1)
      yield* tick
      assert.deepStrictEqual(log(), ["Opened detached trigger-hover"])
      assert.strictEqual(detached.getAttribute("data-popup-open"), "")
      assert.strictEqual(part("popup").textContent, "More on detached")
      mouse(detached, "mouseleave", 1, -5)
      mouse(document.body, "mousemove", 1, -10)
      yield* tick
      assert.deepStrictEqual(log(), ["Opened detached trigger-hover", "Dismissed trigger-hover"])
    }))

  it.effect("a wrapped link places the card against the line the pointer moved to before it opened", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      const link = byId("wrapped")
      const lines = [new DOMRect(300, 100, 200, 20), new DOMRect(0, 120, 100, 20)]
      link.getClientRects = () => lines as unknown as DOMRectList
      box(link, 0, 100, 500, 40)
      mouse(link, "mouseenter", 400, 110)
      yield* tick
      mouse(link, "mousemove", 50, 130)
      yield* tick
      yield* TestClock.adjust("100 millis")
      yield* tick
      assert.deepStrictEqual(log(), ["Opened wrapped trigger-hover"])
      const positioner = part("positioner") as HTMLElement
      assert.strictEqual(positioner.style.getPropertyValue("--anchor-width"), "100px")
      assert.strictEqual(positioner.style.getPropertyValue("--anchor-height"), "20px")
    }))

  it.effect("the card keeps the line hovered before the delay when the lines move during it", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      const link = byId("wrapped")
      let lines = [new DOMRect(300, 100, 200, 20), new DOMRect(0, 120, 100, 20)]
      link.getClientRects = () => lines as unknown as DOMRectList
      box(link, 0, 100, 500, 40)
      mouse(link, "mouseenter", 400, 110)
      lines = [new DOMRect(300, 120, 200, 20), new DOMRect(0, 140, 100, 20)]
      yield* TestClock.adjust("100 millis")
      yield* tick
      assert.deepStrictEqual(log(), ["Opened wrapped trigger-hover"])
      const positioner = part("positioner") as HTMLElement
      assert.strictEqual(positioner.style.getPropertyValue("--anchor-width"), "200px")
      assert.strictEqual(positioner.style.getPropertyValue("--anchor-height"), "20px")
    }))

  it.effect("focus without a focus ring opens nothing, on a link or a detached one", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      for (const id of ["a", "detached"]) {
        const link = byId(id)
        Object.defineProperty(link, "matches", {
          configurable: true,
          value: (selector: string) => selector !== ":focus-visible" && Element.prototype.matches.call(link, selector)
        })
        link.focus()
        yield* tick
        byId("outside").focus()
        yield* tick
      }
      assert.deepStrictEqual(log(), [])
    }))
})
