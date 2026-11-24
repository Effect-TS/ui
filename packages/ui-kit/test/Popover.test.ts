import { type Component, type Mount, View } from "@effect/ui"
import {
  Dialog,
  Popover,
  type PopoverEvents,
  type PopoverProps,
  PopoverTrigger,
  Positioning
} from "@effect/ui-kit"
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
      popover.trigger({
        element: h.button.attrs({
          id: "press",
          "data-pressed": "x",
          "aria-disabled": "true"
        })
      })
        .children("Press"),
      popover.trigger({
        element: h.button.attr("id", "hover"),
        openOnHover: true,
        closeDelay: 50
      }).children("Hover"),
      popover.trigger({
        element: h.button.attrs({ id: "off", "aria-disabled": "true" }),
        openOnHover: true,
        disabled: true
      }).children("Off"),
      popover.portal(h.dialog.attr("style", "z-index:2"))?.children(
        popover.backdrop(h.div.class("backdrop")),
        popover.positioner(
          h.div.class("positioner").attrs({ role: "none", style: "color:red" })
        ).children(
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

const top = {
  side: "top",
  align: "start",
  anchorHidden: true,
  arrowUncentered: true
} as const

type Track = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const mountOn = (scene: Rendered, locator: Locator.Locator): Track =>
  (scene.get(locator) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as Track
const running = <
  S extends Rendered & { readonly expectMount: (mount: Track) => S }
>(scene: S): S =>
  scene.expectMount(mountOn(scene, positioner)).expectMount(
    mountOn(scene, popup)
  )

const completed = (tag: string) => ({ _tag: tag }) as never
const opened = (triggerId: string, reason: "trigger-press" | "trigger-hover") =>
  ({ _tag: "RequestedOpen", triggerId, reason }) as PopoverEvents
const dismissed = (reason: string) =>
  ({ _tag: "RequestedClose", reason }) as PopoverEvents
const pressedTrigger = {
  _tag: "RequestedClose",
  reason: "trigger-press"
} as const

describe("Popover", () => {
  it.effect("is a dialog that isn't modal, at the document's origin, placed under the trigger it is open for", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        Popover,
        { open: false, sideOffset: 8 },
        standIn
      )
      assert.isUndefined(scene.query(portal))
      assert.deepInclude(scene.get(off).attrs, {
        "data-disabled": "",
        disabled: ""
      })
      assert.isUndefined(scene.get(off).attrs?.["aria-disabled"])
      assert.isUndefined(scene.get(press).attrs?.["data-pressed"])
      assert.isUndefined(scene.get(press).attrs?.disabled)
      assert.isUndefined(scene.get(press).attrs?.["aria-disabled"])
      scene.childEmit(Dialog, { _tag: "RequestedOpen", triggerId: "press" })
        .emitted(opened("press", "trigger-press"))
      scene.props({ open: true, sideOffset: 8 })
      assert.deepInclude(scene.get(press).attrs, {
        "aria-expanded": "true",
        "data-pressed": ""
      })
      assert.strictEqual(scene.get(hover).attrs?.["aria-expanded"], "false")
      assert.match(
        scene.get(portal).attrs?.style ?? "",
        /^z-index:2;position:fixed;inset:0;.*;position:absolute;inset:0 auto auto 0$/
      )
      assert.isUndefined(scene.get(portal).attrs?.["aria-modal"])
      assert.deepInclude(scene.get(positioner).attrs, {
        role: "presentation",
        "data-side": "bottom",
        "data-align": "center",
        "data-open": "",
        style:
          "color:red;position:absolute;inset:auto;margin:0;--available-width:100vw;--available-height:100vh"
      })
      assert.notInclude(scene.get(backdrop).attrs?.style, "pointer-events")
      scene.mounted(Positioning.TrackPosition, top)
      assert.deepInclude(scene.get(positioner).attrs, {
        "data-side": "top",
        "data-align": "start",
        "data-anchor-hidden": ""
      })
      assert.deepInclude(scene.get(popup).attrs, {
        "data-side": "top",
        "data-align": "start",
        "data-open": ""
      })
      assert.deepInclude(scene.get(arrow).attrs, {
        "aria-hidden": "true",
        "data-side": "top",
        "data-uncentered": ""
      })
      running(scene).childEmit(Dialog, pressedTrigger).emitted(
        dismissed("trigger-press")
      )
      scene.props({ open: true, positionMethod: "fixed" })
      assert.notInclude(scene.get(portal).attrs?.style, "position:absolute")
      assert.include(scene.get(positioner).attrs?.style, "position:fixed")
    }))

  it.effect("opens after the mouse rests on a hover trigger, and closes once the pointer has left", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        Popover,
        { open: false, modal: true },
        standIn
      )
      assert.throws(() => scene.fire(off, "mouseenter"))
      scene.fire(hover, "mouseenter")
      const [opening] = scene.current.pending
      assert.deepStrictEqual(opening?.command.args, {
        delay: 300,
        drawn: "hover"
      })
      scene.resolve(opening!.command, completed("CompletedWaitBeforeOpening"))
        .emitted(opened("hover", "trigger-hover"))
      scene.props({ open: true, modal: true })
      assert.isUndefined(scene.get(hover).attrs?.["data-pressed"])
      assert.include(scene.get(backdrop).attrs?.style, "pointer-events:none")
      running(scene).childEmit(Dialog, {
        _tag: "RequestedClose",
        reason: "focus-out"
      })
      assert.deepStrictEqual(scene.current.emitted, [])

      scene.fire(hover, "mouseleave")
      scene.fire(positioner, "mouseenter")
      scene.fire(positioner, "mouseleave")
      const closing = scene.current.pending.find((entry) =>
        entry.command.name === "WaitBeforeClosing"
      )
      assert.deepStrictEqual(closing?.command.args, { delay: 50 })
      scene.resolve(closing!.command, completed("CompletedWaitBeforeClosing"))
        .emitted(dismissed("trigger-hover"))
      const patience = scene.current.pending.find((entry) =>
        entry.command.name === "WaitBeforeClosingOnPress"
      )
      scene.resolve(
        patience!.command,
        completed("CompletedWaitBeforeClosingOnPress")
      )
    }))

  it.effect("a pointer that a layer covered and gave back where it rested is no hover", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Popover, { open: false }, standIn)
      scene.fire(hover, "mouseleave", { x: 10, y: 20 }).fire(
        hover,
        "mouseenter",
        {
          x: 10,
          y: 20
        }
      )
      assert.deepStrictEqual(scene.current.pending, [])
      scene.fire(hover, "mouseleave", { x: 0, y: 0 }).fire(
        hover,
        "mouseenter",
        {
          x: 10,
          y: 20
        }
      )
      assert.strictEqual(
        scene.current.pending[0]?.command.name,
        "WaitBeforeOpening"
      )
      scene.fire(hover, "mouseleave", { x: 0, y: 0 })
    }))

  it.effect("a press soon after a hover keeps the popover open as a pressed one, and a later press closes it", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        Popover,
        { open: false, modal: true },
        standIn
      )
      scene.fire(hover, "mouseenter")
      scene.resolve(
        scene.current.pending[0]!.command,
        completed("CompletedWaitBeforeOpening")
      )
        .emitted(opened("hover", "trigger-hover"))
      scene.props({ open: true, modal: true })
      running(scene).childEmit(Dialog, pressedTrigger).emitted(
        opened("hover", "trigger-press")
      )
      assert.strictEqual(scene.get(hover).attrs?.["data-pressed"], "")
      scene.fire(hover, "mouseleave")
      assert.isUndefined(
        scene.current.pending.find((entry) =>
          entry.command.name === "WaitBeforeClosing"
        )
      )
      scene.childEmit(Dialog, pressedTrigger).emitted(
        dismissed("trigger-press")
      )

      scene.props({ open: false, modal: true })
      scene.fire(hover, "mouseenter")
      scene.resolve(
        scene.current.pending[0]!.command,
        completed("CompletedWaitBeforeOpening")
      )
        .emitted(opened("hover", "trigger-hover"))
      scene.props({ open: true, modal: true })
      const patience = scene.current.pending.find((entry) =>
        entry.command.name === "WaitBeforeClosingOnPress"
      )
      running(scene).resolve(
        patience!.command,
        completed("CompletedWaitBeforeClosingOnPress")
      )
      scene.childEmit(Dialog, pressedTrigger).emitted(
        dismissed("trigger-press")
      )
    }))

  it.effect("moves to another trigger that asks for it, and passes on what its dialog emits", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Popover, {
        open: true,
        triggerId: "press"
      }, standIn)
      running(scene).fire(hover, "mouseenter").emitted(
        opened("hover", "trigger-hover")
      )
      scene.props({ open: true, triggerId: "hover" })
      assert.strictEqual(scene.get(hover).attrs?.["aria-expanded"], "true")
      running(scene).childEmit(Dialog, {
        _tag: "RequestedOpen",
        triggerId: "press"
      }).emitted(
        opened("press", "trigger-press")
      )
      scene.childEmit(Dialog, { _tag: "RequestedClose", reason: "escape-key" })
        .emitted(dismissed("escape-key"))
      scene.props({ open: false, keepMounted: true })
      assert.strictEqual(scene.get(popup).attrs?.["data-instant"], "dismiss")
      scene.childEmit(Dialog, { _tag: "Settled", open: false }).emitted({
        _tag: "Settled",
        open: false
      })
    }))

  it("PopoverTrigger clears contradictory consumer aria-disabled", () => {
    const helper = View.makeHelper<never, {}, Html.Elements>({}, Html)
    const detached = (disabled: boolean) =>
      View.build(
        PopoverTrigger(helper, {
          element: helper.button.attr("aria-disabled", "true").disabled(
            !disabled
          ),
          props: { open: false, popupId: "pop", disabled }
        }),
        []
      )
    assert.strictEqual(detached(true).attrs.disabled, "")
    assert.isUndefined(detached(true).attrs["aria-disabled"])
    assert.isUndefined(detached(false).attrs.disabled)
    assert.isUndefined(detached(false).attrs["aria-disabled"])
  })
})
