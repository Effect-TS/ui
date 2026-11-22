import type { Component, Mount, View } from "@effect/ui"
import { Dialog, Popover, type PopoverEvents, type PopoverProps, Positioning } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof Popover>
type H = View.Helper<never, PopoverProps> & View.Tags<Html.Elements, never>

const standIn = {
  elements: Html,
  view: (popover: Parts, h: H) =>
    h.div(
      popover.trigger({ element: h.button.attrs({ id: "press", "data-pressed": "x" }) }).children("Press"),
      popover.trigger({ element: h.button.attr("id", "hover"), openOnHover: true, closeDelay: 50 }).children("Hover"),
      popover.trigger({ element: h.button.attr("id", "off"), openOnHover: true, disabled: true }).children("Off"),
      popover.portal(h.dialog.attr("style", "z-index:2"))?.children(
        popover.backdrop(h.div.class("backdrop")),
        popover.positioner(h.div.class("positioner").attrs({ role: "none", style: "color:red" })).children(
          popover.popup(h.div.class("popup").attr("data-side", "x")).children(
            popover.arrow(h.div.class("arrow")),
            popover.title(h.h2).children("Notifications"),
            popover.close(h.button).children("Close")
          )
        )
      )
    )
}

const press = Locator.text("Press", { exact: true })
const hover = Locator.text("Hover", { exact: true })
const off = Locator.text("Off", { exact: true })
const portal = Locator.tag("dialog")
const backdrop = Locator.attr("class", "backdrop")
const positioner = Locator.attr("class", "positioner")
const popup = Locator.attr("class", "popup")
const arrow = Locator.attr("class", "arrow")

const top = { side: "top", align: "start", anchorHidden: true, arrowUncentered: true } as const

type Track = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const mountOn = (s: Rendered, locator: Locator.Locator): Track =>
  (s.get(locator) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as Track
const running = <S extends Rendered & { readonly expectMount: (mount: Track) => S }>(s: S): S =>
  s.expectMount(mountOn(s, positioner)).expectMount(mountOn(s, popup))

const completed = (tag: string) => ({ _tag: tag }) as never
const opened = (triggerId: string, reason: "trigger-press" | "trigger-hover") =>
  ({ _tag: "RequestedOpen", triggerId, reason }) as PopoverEvents
const dismissed = (reason: string) => ({ _tag: "RequestedClose", reason }) as PopoverEvents
const pressedTrigger = { _tag: "RequestedClose", reason: "trigger-press" } as const

describe("Popover", () => {
  it.effect("is a dialog that isn't modal, at the document's origin, placed under the trigger it is open for", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Popover, { open: false, sideOffset: 8 }, standIn)
      assert.isUndefined(s.query(portal))
      assert.deepInclude(s.get(off).attrs, { "data-disabled": "", disabled: "" })
      assert.isUndefined(s.get(press).attrs?.["data-pressed"])
      s.childEmit(Dialog, { _tag: "RequestedOpen", triggerId: "press" }).emitted(opened("press", "trigger-press"))
      s.props({ open: true, sideOffset: 8 })
      assert.deepInclude(s.get(press).attrs, { "aria-expanded": "true", "data-pressed": "" })
      assert.strictEqual(s.get(hover).attrs?.["aria-expanded"], "false")
      assert.match(
        s.get(portal).attrs?.style ?? "",
        /^z-index:2;position:fixed;inset:0;.*;position:absolute;inset:0 auto auto 0$/
      )
      assert.isUndefined(s.get(portal).attrs?.["aria-modal"])
      assert.deepInclude(s.get(positioner).attrs, {
        role: "presentation",
        "data-side": "bottom",
        "data-align": "center",
        "data-open": "",
        style: "color:red;position:absolute;inset:auto;margin:0;--available-width:100vw;--available-height:100vh"
      })
      assert.notInclude(s.get(backdrop).attrs?.style, "pointer-events")
      s.mounted(Positioning.TrackPosition, top)
      assert.deepInclude(s.get(positioner).attrs, {
        "data-side": "top",
        "data-align": "start",
        "data-anchor-hidden": ""
      })
      assert.deepInclude(s.get(popup).attrs, { "data-side": "top", "data-align": "start", "data-open": "" })
      assert.deepInclude(s.get(arrow).attrs, { "aria-hidden": "true", "data-side": "top", "data-uncentered": "" })
      running(s).childEmit(Dialog, pressedTrigger).emitted(dismissed("trigger-press"))
      s.props({ open: true, positionMethod: "fixed" })
      assert.notInclude(s.get(portal).attrs?.style, "position:absolute")
      assert.include(s.get(positioner).attrs?.style, "position:fixed")
    }))

  it.effect("opens after the mouse rests on a hover trigger, and closes once the pointer has left", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Popover, { open: false, modal: true }, standIn)
      assert.throws(() => s.fire(off, "mouseenter"))
      s.fire(hover, "mouseenter")
      const [opening] = s.current.pending
      assert.deepStrictEqual(opening?.command.args, { delay: 300 })
      s.resolve(opening!.command, completed("CompletedWaitBeforeOpening")).emitted(opened("hover", "trigger-hover"))
      s.props({ open: true, modal: true })
      assert.isUndefined(s.get(hover).attrs?.["data-pressed"])
      assert.include(s.get(backdrop).attrs?.style, "pointer-events:none")
      running(s).childEmit(Dialog, { _tag: "RequestedClose", reason: "focus-out" })
      assert.deepStrictEqual(s.current.emitted, [])

      s.fire(hover, "mouseleave")
      s.fire(positioner, "mouseenter")
      s.fire(positioner, "mouseleave")
      const closing = s.current.pending.find((entry) => entry.command.name === "WaitBeforeClosing")
      assert.deepStrictEqual(closing?.command.args, { delay: 50 })
      s.resolve(closing!.command, completed("CompletedWaitBeforeClosing")).emitted(dismissed("trigger-hover"))
      const patience = s.current.pending.find((entry) => entry.command.name === "WaitBeforeClosingOnPress")
      s.resolve(patience!.command, completed("CompletedWaitBeforeClosingOnPress"))
    }))

  it.effect("a pointer that a layer covered and gave back where it rested is no hover", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Popover, { open: false }, standIn)
      s.fire(hover, "mouseleave", { x: 10, y: 20 }).fire(hover, "mouseenter", { x: 10, y: 20 })
      assert.deepStrictEqual(s.current.pending, [])
      s.fire(hover, "mouseleave", { x: 0, y: 0 }).fire(hover, "mouseenter", { x: 10, y: 20 })
      assert.strictEqual(s.current.pending[0]?.command.name, "WaitBeforeOpening")
      s.fire(hover, "mouseleave", { x: 0, y: 0 })
    }))

  it.effect("a press soon after a hover keeps the popover open as a pressed one, and a later press closes it", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Popover, { open: false, modal: true }, standIn)
      s.fire(hover, "mouseenter")
      s.resolve(s.current.pending[0]!.command, completed("CompletedWaitBeforeOpening"))
        .emitted(opened("hover", "trigger-hover"))
      s.props({ open: true, modal: true })
      running(s).childEmit(Dialog, pressedTrigger).emitted(opened("hover", "trigger-press"))
      assert.strictEqual(s.get(hover).attrs?.["data-pressed"], "")
      s.fire(hover, "mouseleave")
      assert.isUndefined(s.current.pending.find((entry) => entry.command.name === "WaitBeforeClosing"))
      s.childEmit(Dialog, pressedTrigger).emitted(dismissed("trigger-press"))

      s.props({ open: false, modal: true })
      s.fire(hover, "mouseenter")
      s.resolve(s.current.pending[0]!.command, completed("CompletedWaitBeforeOpening"))
        .emitted(opened("hover", "trigger-hover"))
      s.props({ open: true, modal: true })
      const patience = s.current.pending.find((entry) => entry.command.name === "WaitBeforeClosingOnPress")
      running(s).resolve(patience!.command, completed("CompletedWaitBeforeClosingOnPress"))
      s.childEmit(Dialog, pressedTrigger).emitted(dismissed("trigger-press"))
    }))

  it.effect("moves to another trigger that asks for it, and passes on what its dialog emits", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Popover, { open: true, triggerId: "press" }, standIn)
      running(s).fire(hover, "mouseenter").emitted(opened("hover", "trigger-hover"))
      s.props({ open: true, triggerId: "hover" })
      assert.strictEqual(s.get(hover).attrs?.["aria-expanded"], "true")
      running(s).childEmit(Dialog, { _tag: "RequestedOpen", triggerId: "press" }).emitted(
        opened("press", "trigger-press")
      )
      s.childEmit(Dialog, { _tag: "RequestedClose", reason: "escape-key" }).emitted(dismissed("escape-key"))
      s.props({ open: false, keepMounted: true })
      assert.strictEqual(s.get(popup).attrs?.["data-instant"], "dismiss")
      s.childEmit(Dialog, { _tag: "Settled", open: false }).emitted({ _tag: "Settled", open: false })
    }))
})
