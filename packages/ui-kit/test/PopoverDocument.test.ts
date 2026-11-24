// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Popover, PopoverTrigger } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { TestClock } from "effect/testing"
import { byId, click, container, popovers, tick } from "./utils/document.ts"

const Third = Schema.Literals(["on", "off", "gone"])

const Message = UiSchema.TaggedEnum({
  Shown: {},
  Changed: { third: Third },
  RequestedOpen: {
    triggerId: Schema.NullOr(Schema.String),
    reason: Schema.String
  },
  RequestedClose: { reason: Schema.String },
  Settled: { open: Schema.Boolean }
})

const Page = Html.component({
  name: "Page",
  props: Schema.Struct({
    modal: Schema.optional(Schema.Boolean),
    holdHoverExit: Schema.optional(Schema.Boolean),
    anchor: Schema.optional(Schema.String)
  }),
  model: Schema.Struct({
    open: Schema.Boolean,
    triggerId: Schema.NullOr(Schema.String),
    hovered: Schema.Boolean,
    third: Third,
    log: Schema.Array(Schema.String)
  }),
  message: Message
}).make({
  init: () => ({
    open: false,
    triggerId: null,
    hovered: false,
    third: "on" as const,
    log: []
  }),
  update: {
    Shown: ($) => ({ ...$.model, open: true, hovered: false }),
    Changed: ($, { third }) => ({ ...$.model, third }),
    RequestedOpen: ($, { reason, triggerId }) => ({
      ...$.model,
      open: true,
      triggerId,
      hovered: reason === "trigger-hover",
      log: [...$.model.log, `RequestedOpen ${triggerId} ${reason}`]
    }),
    RequestedClose: ($, { reason }) => ({
      ...$.model,
      open: false,
      log: [...$.model.log, `RequestedClose ${reason}`]
    }),
    Settled: ($) => $.model
  },
  view: (h, model) =>
    h.div(
      h.button.attr("id", "show").onClick(Message.Shown()).children("Show"),
      h.span.attr("id", "anchor"),
      Popover(h, {
        props: {
          modal: h.props.modal,
          anchor: h.props.anchor,
          holdExit: h.props.holdHoverExit === true && model.hovered,
          open: model.open,
          triggerId: model.triggerId,
          id: "popover"
        },
        onEmit: {
          RequestedOpen: ({ reason, triggerId }) =>
            Message.RequestedOpen({ triggerId, reason }),
          RequestedClose: ({ reason }) => Message.RequestedClose({ reason }),
          Settled: ({ open }) => Message.Settled({ open })
        },
        view: (popover) =>
          h.div(
            popover.trigger({
              element: h.button.attr("id", "a"),
              openOnHover: true,
              delay: 0
            }).children("A"),
            popover.trigger({
              element: h.button.attr("id", "b"),
              openOnHover: true,
              delay: 0
            }).children("B"),
            model.third === "gone" ? null : popover.trigger({
              element: h.button.attr("id", "c"),
              openOnHover: true,
              delay: 30,
              disabled: model.third === "off"
            }).children("C"),
            popover.finalFocus(h.button.attr("id", "final")).children("Final"),
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
        props: {
          open: model.open && model.triggerId === "detached",
          popupId: "popover"
        }
      }).children("Detached"),
      model.third === "gone" ? null : PopoverTrigger(h, {
        element: h.button.attr(
          "id",
          model.third === "off" ? "replacement" : "detached-c"
        ),
        props: {
          open: model.open && model.triggerId === "detached-c",
          popupId: "popover",
          openOnHover: true,
          delay: 30,
          disabled: model.third === "off"
        }
      }).children("Detached C")
    )
})

const mountPage = Effect.fnUntraced(
  function*(props: typeof Page.props.Type = {}, into?: Element) {
    if (into === undefined) yield* popovers
    const app = into ?? (yield* container)
    const root = yield* BrowserHost.mountEffect(Page, props, app)
    yield* tick
    return { log: () => root.model()!.log, send: root.send }
  }
)

const elsewhere = Effect.acquireRelease(
  Effect.sync(() => {
    const other = document.implementation.createHTMLDocument()
    return other.body.appendChild(other.createElement("div"))
  }),
  (element) => Effect.sync(() => element.remove())
)

const hover = (target: Element) => {
  target.dispatchEvent(
    new MouseEvent("mouseenter", { clientX: 10, clientY: 10 })
  )
  target.dispatchEvent(
    new PointerEvent("pointerenter", {
      clientX: 10,
      clientY: 10,
      pointerType: "mouse"
    })
  )
}

const mouse = (
  target: Element,
  type: "mouseenter" | "mouseleave",
  clientX = 0,
  clientY = 0
) => target.dispatchEvent(new MouseEvent(type, { clientX, clientY }))

const containers = () =>
  Array.from(
    byId("viewport").children,
    (child) =>
      `${
        child.hasAttribute("data-previous") ? "previous" : "current"
      }: ${child.textContent}`
  )

describe("Popover in a document", { concurrent: false }, () => {
  it.effect("a trigger drawn elsewhere opens the popover it names, is its anchor, and closes it", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      const trigger = byId("detached")
      click(trigger)
      yield* tick
      yield* tick
      assert.deepStrictEqual(log(), ["RequestedOpen detached trigger-press"])
      assert.strictEqual(trigger.getAttribute("aria-controls"), "popover")
      assert.deepStrictEqual(containers(), ["current: For detached"])
      click(trigger)
      yield* tick
      assert.deepStrictEqual(log(), [
        "RequestedOpen detached trigger-press",
        "RequestedClose trigger-press"
      ])
    }))

  it.effect("the viewport sizes the positioner, and shows the last trigger's content while it moves to another", () =>
    Effect.gen(function*() {
      yield* mountPage({ anchor: "anchor" })
      byId("b").getBoundingClientRect = () => new DOMRect(100, 0, 10, 10)
      click(byId("a"))
      yield* tick
      yield* tick
      const positioner = document.querySelector<HTMLElement>(
        "[data-positioner]"
      )!
      assert.notStrictEqual(
        positioner.style.getPropertyValue("--positioner-width"),
        ""
      )
      const viewport = byId("viewport")
      const seen: Array<string> = []
      const observer = new MutationObserver(() => {
        seen.push(
          `${viewport.getAttribute("data-activation-direction")}: ${
            containers().join(", ")
          }`
        )
      })
      observer.observe(viewport, {
        attributes: true,
        childList: true,
        subtree: true
      })
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
      const { log } = yield* mountPage({ modal: true, holdHoverExit: true })
      const show = byId("show")
      const focusedInside = () =>
        byId("popover").contains(document.activeElement)
      const positioner = () => document.querySelector("[data-positioner]")!
      show.focus()
      mouse(byId("a"), "mouseenter", 10, 10)
      yield* tick
      assert.deepStrictEqual(log(), ["RequestedOpen a trigger-hover"])
      assert.strictEqual(document.activeElement, show)
      mouse(byId("a"), "mouseleave", 20, 10)
      mouse(byId("b"), "mouseenter", 20, 10)
      yield* tick
      assert.deepStrictEqual(log().slice(1), ["RequestedOpen b trigger-hover"])
      mouse(byId("b"), "mouseleave", 20, 30)
      mouse(positioner(), "mouseenter", 20, 30)
      yield* tick
      assert.deepStrictEqual(log().slice(2), [])
      click(byId("b"))
      yield* tick
      assert.deepStrictEqual(log().slice(2), ["RequestedOpen b trigger-press"])
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
      assert.deepStrictEqual(log().slice(4), [
        "RequestedOpen a trigger-hover",
        "RequestedClose trigger-hover"
      ])
      assert.strictEqual(document.activeElement, show)
      click(show)
      yield* tick
      yield* tick
      assert.isTrue(focusedInside())
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
      yield* tick
      yield* tick
      assert.strictEqual(document.activeElement, byId("final"))
    }))

  it.effect("a trigger drawn elsewhere reaches the popover with its id in its own document", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      const app = yield* elsewhere
      const second = yield* mountPage({}, app)
      click(byId("detached"))
      yield* tick
      assert.deepStrictEqual(log(), ["RequestedOpen detached trigger-press"])
      assert.deepStrictEqual(second.log(), [])
      click(app.ownerDocument.getElementById("detached")!)
      yield* tick
      assert.deepStrictEqual(second.log(), [
        "RequestedOpen detached trigger-press"
      ])
    }))

  it.effect("a disabled trigger asks for nothing, and one disabled or removed while the mouse rests on it opens nothing", () =>
    Effect.gen(function*() {
      const { log, send } = yield* mountPage()
      const change = (third: "on" | "off" | "gone") =>
        Effect.andThen(
          Effect.sync(() => send(Message.Changed({ third }))),
          tick
        )
      yield* change("off")
      for (const id of ["c", "replacement"]) {
        const icon = byId(id).appendChild(document.createElement("span"))
        icon.click()
        yield* tick
        assert.deepStrictEqual(log(), [], id)
      }
      for (const id of ["c", "detached-c"]) {
        for (const third of ["off", "gone"] as const) {
          yield* change("on")
          hover(byId(id))
          yield* tick
          yield* change(third)
          yield* TestClock.adjust("30 millis")
          yield* tick
          assert.deepStrictEqual(log(), [], `${id} ${third}`)
        }
      }
      yield* change("on")
      hover(byId("detached-c"))
      yield* tick
      yield* TestClock.adjust("30 millis")
      yield* tick
      assert.deepStrictEqual(log(), ["RequestedOpen detached-c trigger-hover"])
    }))
})
