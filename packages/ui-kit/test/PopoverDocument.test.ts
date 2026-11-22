// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Popover, PopoverTrigger } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, click, container, popovers, tick } from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({
  Shown: {},
  Opened: { triggerId: Schema.NullOr(Schema.String), reason: Schema.String },
  Dismissed: { reason: Schema.String },
  Settled: { open: Schema.Boolean }
})

const Page = Component.define({
  name: "Page",
  props: Schema.Struct({ modal: Schema.optional(Schema.Boolean), anchor: Schema.optional(Schema.String) }),
  model: Schema.Struct({
    open: Schema.Boolean,
    triggerId: Schema.NullOr(Schema.String),
    log: Schema.Array(Schema.String)
  }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ open: false, triggerId: null, log: [] }),
  update: {
    Shown: (model) => ({ ...model, open: true }),
    Opened: (model, { reason, triggerId }) => ({
      open: true,
      triggerId,
      log: [...model.log, `Opened ${triggerId} ${reason}`]
    }),
    Dismissed: (model, { reason }) => ({ ...model, open: false, log: [...model.log, `Dismissed ${reason}`] }),
    Settled: (model) => model
  },
  view: (model, h) =>
    h.div(
      h.button.attr("id", "show").onClick(Message.Shown()).children("Show"),
      h.span.attr("id", "anchor"),
      Popover(h, {
        props: { ...h.props, open: model.open, triggerId: model.triggerId, id: "popover" },
        onEmit: {
          Opened: ({ reason, triggerId }) => Message.Opened({ triggerId, reason }),
          Dismissed: ({ reason }) => Message.Dismissed({ reason }),
          Settled: ({ open }) => Message.Settled({ open })
        },
        view: (popover) =>
          h.div(
            popover.trigger({ element: h.button.attr("id", "a"), openOnHover: true, delay: 0 }).children("A"),
            popover.trigger({ element: h.button.attr("id", "b"), openOnHover: true, delay: 0 }).children("B"),
            popover.portal(h.dialog)?.children(
              popover.positioner(h.div.attr("data-positioner", "")).children(
                popover.popup(h.div).children(
                  popover.viewport(h.div.attr("id", "viewport")).children(
                    popover.title(h.h2).children(`For ${popover.triggerId}`)
                  )
                )
              )
            )
          )
      }),
      PopoverTrigger(h, {
        element: h.button.attr("id", "detached"),
        props: { open: model.open && model.triggerId === "detached", popupId: "popover" }
      }).children("Detached")
    )
})

const mountPage = Effect.fnUntraced(function*(props: typeof Page.props.Type = {}) {
  yield* popovers
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, props, app)
  yield* tick
  return { log: () => root.model()!.log }
})

const mouse = (target: Element, type: "mouseenter" | "mouseleave", clientX = 0, clientY = 0) =>
  target.dispatchEvent(new MouseEvent(type, { clientX, clientY }))

const containers = () =>
  Array.from(
    byId("viewport").children,
    (child) => `${child.hasAttribute("data-previous") ? "previous" : "current"}: ${child.textContent}`
  )

describe("Popover in a document", { concurrent: false }, () => {
  it.effect("a trigger drawn elsewhere opens the popover it names, is its anchor, and closes it", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      const trigger = byId("detached")
      click(trigger)
      yield* tick
      yield* tick
      assert.deepStrictEqual(log(), ["Opened detached trigger-press"])
      assert.strictEqual(trigger.getAttribute("aria-controls"), "popover")
      assert.deepStrictEqual(containers(), ["current: For detached"])
      click(trigger)
      yield* tick
      assert.deepStrictEqual(log(), ["Opened detached trigger-press", "Dismissed trigger-press"])
    }))

  it.effect("the viewport sizes the positioner, and shows the last trigger's content while it moves to another", () =>
    Effect.gen(function*() {
      yield* mountPage({ anchor: "anchor" })
      byId("b").getBoundingClientRect = () => new DOMRect(100, 0, 10, 10)
      click(byId("a"))
      yield* tick
      yield* tick
      const positioner = document.querySelector<HTMLElement>("[data-positioner]")!
      assert.notStrictEqual(positioner.style.getPropertyValue("--positioner-width"), "")
      const viewport = byId("viewport")
      const seen: Array<string> = []
      const observer = new MutationObserver(() => {
        seen.push(`${viewport.getAttribute("data-activation-direction")}: ${containers().join(", ")}`)
      })
      observer.observe(viewport, { attributes: true, childList: true, subtree: true })
      click(byId("b"))
      yield* tick
      yield* tick
      observer.disconnect()
      assert.include(seen, "right : previous: For a, current: For b")
      assert.deepStrictEqual(containers(), ["current: For b"])
      assert.isFalse(viewport.hasAttribute("data-transitioning"))
    }))

  it.effect("hover opens without focus and closes once the pointer leaves, and a press or the consumer's open takes focus", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ modal: true })
      const show = byId("show")
      const focusedInside = () => byId("popover").contains(document.activeElement)
      const positioner = () => document.querySelector("[data-positioner]")!
      show.focus()
      mouse(byId("a"), "mouseenter", 10, 10)
      yield* tick
      assert.deepStrictEqual(log(), ["Opened a trigger-hover"])
      assert.strictEqual(document.activeElement, show)
      mouse(byId("a"), "mouseleave", 20, 10)
      mouse(byId("b"), "mouseenter", 20, 10)
      yield* tick
      assert.deepStrictEqual(log().slice(1), ["Opened b trigger-hover"])
      mouse(byId("b"), "mouseleave", 20, 30)
      mouse(positioner(), "mouseenter", 20, 30)
      yield* tick
      assert.deepStrictEqual(log().slice(2), [])
      click(byId("b"))
      yield* tick
      assert.deepStrictEqual(log().slice(2), ["Opened b trigger-press"])
      assert.isTrue(focusedInside())
      click(byId("b"))
      yield* tick
      yield* tick

      show.focus()
      mouse(byId("a"), "mouseenter", 10, 10)
      yield* tick
      mouse(byId("a"), "mouseleave", 10, 30)
      mouse(positioner(), "mouseenter", 10, 30)
      mouse(positioner(), "mouseleave", 10, 60)
      yield* tick
      yield* tick
      assert.deepStrictEqual(log().slice(4), ["Opened a trigger-hover", "Dismissed trigger-hover"])
      assert.strictEqual(document.activeElement, show)
      click(show)
      yield* tick
      yield* tick
      assert.isTrue(focusedInside())
    }))
})
