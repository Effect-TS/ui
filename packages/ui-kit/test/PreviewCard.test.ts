import type { Component, Mount, View } from "@effect/ui"
import {
  PreviewCard,
  type PreviewCardEvents,
  type PreviewCardProps
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof PreviewCard>
type H = View.Helper<never, PreviewCardProps> & View.Tags<Html.Elements, never>

const standIn = {
  elements: Html,
  view: (previewCard: Parts, h: H) =>
    h.div(
      previewCard.trigger({
        element: h.a.attr("id", "typography").attr("href", "/typography").attr(
          "data-popup-open",
          "x"
        )
      }).children("Typography"),
      " and ",
      previewCard.trigger({
        element: h.a.attr("href", "/kerning"),
        delay: 100,
        closeDelay: 50
      }).children("Kerning"),
      previewCard.portal(h.div.class("portal").attr("style", "z-index:2"))
        ?.children(
          previewCard.backdrop(h.div.class("backdrop")),
          previewCard.positioner(h.div.class("positioner").attr("role", "none"))
            .children(
              previewCard.popup(
                h.div.class("popup").attr("tabindex", "0").attr(
                  "data-side",
                  "x"
                )
              ).children(
                previewCard.arrow(h.div.class("arrow")),
                previewCard.viewport(h.div.class("viewport")).children(
                  "Preview"
                )
              )
            )
        )
    )
}

const typography = Locator.text("Typography", { exact: true })
const kerning = Locator.text("Kerning", { exact: true })
const portal = Locator.attr("class", "portal")
const backdrop = Locator.attr("class", "backdrop")
const positioner = Locator.attr("class", "positioner")
const popup = Locator.attr("class", "popup")
const arrow = Locator.attr("class", "arrow")
const viewport = Locator.attr("class", "viewport")

const top = {
  side: "top",
  align: "start",
  anchorHidden: false,
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
  scene.expectMount(mountOn(scene, portal)).expectMount(
    mountOn(scene, positioner)
  )
    .expectMount(mountOn(scene, viewport))
const sent = (tag: string, fields: object = {}) =>
  ({ _tag: tag, ...fields }) as never

const partsOf = (
  scene: { readonly parts: (f: (previewCard: Parts) => void) => unknown }
): Parts => {
  let parts: Parts | undefined
  scene.parts((previewCard) => {
    parts = previewCard
  })
  return parts!
}

const opened = (triggerId: string, reason: "trigger-hover" | "trigger-focus") =>
  ({ _tag: "RequestedOpen", triggerId, reason }) as PreviewCardEvents
const dismissed = (reason: string) =>
  ({ _tag: "RequestedClose", reason }) as PreviewCardEvents

const makeScene = Effect.fnUntraced(function*(props: PreviewCardProps) {
  const scene = yield* HtmlScene.make(PreviewCard, props, standIn)
  return scene.expectMount(mountOn(scene, typography)).expectMount(
    mountOn(scene, kerning)
  )
})

const hovered = Effect.fnUntraced(
  function*(props: Partial<PreviewCardProps> = {}) {
    const scene = yield* makeScene({ open: false, ...props })
    scene.fire(typography, "mouseenter", { x: 10, y: 5 })
    scene.resolve(
      scene.current.pending[0]!.command,
      sent("CompletedWaitBeforeOpening")
    )
      .emitted(opened("typography", "trigger-hover"))
    running(scene.props({ ...props, open: true, triggerId: "typography" }))
    scene.mounted(mountOn(scene, portal), sent("ShowedPortal"))
    return scene
  }
)

describe("PreviewCard", () => {
  it.effect("opens once the mouse rests on a link that announces nothing, with a popup that takes no Tab", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ open: false, sideOffset: 8 })
      assert.isUndefined(scene.query(portal))
      const link = scene.get(typography).attrs ?? {}
      assert.deepInclude(link, { id: "typography", href: "/typography" })
      for (
        const name of [
          "aria-expanded",
          "aria-haspopup",
          "aria-controls",
          "data-popup-open"
        ]
      ) {
        assert.isUndefined(link[name], name)
      }
      assert.isString(scene.get(kerning).attrs?.id)

      scene.fire(typography, "mouseenter", { x: 10, y: 5 })
      const [opening] = scene.current.pending
      assert.deepStrictEqual(opening?.command.args, { delay: 600 })
      scene.resolve(opening!.command, sent("CompletedWaitBeforeOpening"))
        .emitted(opened("typography", "trigger-hover"))
      running(
        scene.props({ open: true, triggerId: "typography", sideOffset: 8 })
      )

      const cardId = scene.get(portal).attrs?.id
      assert.isString(cardId)
      assert.isTrue(scene.get(portal).props?.popoverOpen)
      assert.match(
        scene.get(portal).attrs?.style ?? "",
        /^z-index:2;.*;position:absolute;inset:0 auto auto 0$/
      )
      assert.deepInclude(scene.get(typography).attrs, {
        "data-popup-open": "",
        "data-preview-card-trigger": cardId
      })
      assert.isUndefined(scene.get(kerning).attrs?.["data-popup-open"])
      assert.deepInclude(scene.get(positioner).attrs, {
        role: "presentation",
        "data-open": "",
        "data-side": "bottom",
        "data-align": "center"
      })
      const card = scene.get(popup).attrs ?? {}
      assert.deepInclude(card, {
        tabindex: "-1",
        "data-open": "",
        "data-side": "bottom"
      })
      assert.isUndefined(card.role)
      assert.isUndefined(card["data-instant"])
      assert.deepInclude(scene.get(backdrop).attrs, {
        role: "presentation",
        "data-open": ""
      })
      assert.include(scene.get(backdrop).attrs?.style, "pointer-events:none")

      scene.mounted(
        mountOn(scene, positioner),
        sent("ChangedPlacement", { placement: top })
      )
      assert.deepInclude(scene.get(popup).attrs, {
        "data-side": "top",
        "data-align": "start"
      })
      assert.deepInclude(scene.get(arrow).attrs, {
        "aria-hidden": "true",
        "data-side": "top",
        "data-uncentered": ""
      })
      const parts = partsOf(scene)
      assert.deepInclude(parts, {
        open: true,
        triggerId: "typography",
        openReason: "trigger-hover",
        side: "top"
      })
    }))

  it.effect("waits out the close delay once the pointer has left the link and the card, and coming back holds it", () =>
    Effect.gen(function*() {
      const scene = yield* hovered()
      scene.fire(typography, "mouseleave", { x: 10, y: 15 })
      assert.deepStrictEqual(scene.current.pending, [])
      scene.mounted(mountOn(scene, positioner), sent("LeftHoverArea"))
      const [closing] = scene.current.pending
      assert.strictEqual(closing?.command.name, "WaitBeforeClosing")
      assert.deepStrictEqual(closing?.command.args, { delay: 300 })
      scene.mounted(mountOn(scene, positioner), sent("ReturnedToHoverArea"))
      assert.deepStrictEqual(scene.current.interrupted.map((c) => c.name), [
        "WaitBeforeClosing"
      ])
      scene.mounted(mountOn(scene, positioner), sent("LeftHoverArea"))
      scene.resolve(
        scene.current.pending[0]!.command,
        sent("CompletedWaitBeforeClosing")
      ).emitted(dismissed("trigger-hover"))
    }))

  it.effect("keyboard focus opens after the delay without a transition, and holds the card while it stays", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ open: false })
      scene.fire(typography, "focus", { focusVisible: true })
      assert.deepStrictEqual(scene.current.pending[0]?.command.args, {
        delay: 600
      })
      scene.resolve(
        scene.current.pending[0]!.command,
        sent("CompletedWaitBeforeOpening")
      )
        .emitted(opened("typography", "trigger-focus"))
      running(scene.props({ open: true, triggerId: "typography" }))
      for (const part of [positioner, popup, viewport]) {
        assert.strictEqual(scene.get(part).attrs?.["data-instant"], "focus")
      }
      scene.mounted(mountOn(scene, positioner), sent("LeftHoverArea"))
      assert.deepStrictEqual(scene.current.pending, [])
      scene.fire(typography, "blur", { disabled: false })
        .mounted(mountOn(scene, positioner), sent("FocusedPopup"))
        .mounted(mountOn(scene, positioner), sent("LeftHoverArea"))
      assert.deepStrictEqual(scene.current.pending, [])
      scene.mounted(mountOn(scene, positioner), sent("BlurredPopup"))
        .mounted(mountOn(scene, positioner), sent("FocusedOutside"))
        .emitted(dismissed("trigger-focus"))
    }))

  it.effect("a touch during the hover delay cancels opening", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ open: false })
      const touch = {
        button: 0,
        x: 0,
        y: 0,
        shift: false,
        ctrl: false,
        alt: false,
        meta: false,
        pointerType: "touch"
      }
      scene.fire(typography, "mouseenter", { x: 1, y: 1 })
        .fire(typography, "mousedown", touch)
      assert.deepStrictEqual(scene.current.pending, [])
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("a pointer given back by a layer that covered the link is no new hover", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ open: false })
      scene.fire(typography, "mouseenter", { x: 3, y: 4 })
        .fire(typography, "mouseleave", { x: 3, y: 4 })
        .fire(typography, "mouseenter", { x: 3, y: 4 })
      assert.deepStrictEqual(scene.current.pending, [])
      scene.fire(typography, "mouseleave", { x: 3, y: 4 }).fire(
        typography,
        "mouseenter",
        { x: 5, y: 4 }
      )
      scene.resolve(
        scene.current.pending[0]!.command,
        sent("CompletedWaitBeforeOpening")
      )
        .emitted(opened("typography", "trigger-hover"))
    }))

  it.effect("Escape asks to close and marks the exit as an instant dismiss", () =>
    Effect.gen(function*() {
      const scene = yield* hovered()
      scene.fireDocument("keydown", { key: "Escape" }).emitted(
        dismissed("escape-key")
      )
      scene.props({ open: false, triggerId: "typography" })
      assert.deepInclude(scene.get(positioner).attrs, {
        "data-closed": "",
        "data-instant": "dismiss"
      })
      assert.deepInclude(scene.get(popup).attrs, {
        "data-ending-style": "",
        "data-instant": "dismiss"
      })
      assert.isFalse(partsOf(scene).open)
      assert.isTrue(partsOf(scene).mounted)
    }))

  it.effect("another link moves an open card to it at once", () =>
    Effect.gen(function*() {
      const scene = yield* hovered()
      const other = scene.get(kerning).attrs?.id ?? ""
      scene.fire(typography, "mouseleave", { x: 10, y: 15 }).fire(
        kerning,
        "mouseenter",
        { x: 50, y: 5 }
      )
        .emitted(opened(other, "trigger-hover"))
      scene.props({ open: true, triggerId: other })
      assert.strictEqual(scene.get(kerning).attrs?.["data-popup-open"], "")
      assert.isUndefined(scene.get(typography).attrs?.["data-popup-open"])
      scene.fire(kerning, "mouseleave", { x: 50, y: 15 }).mounted(
        mountOn(scene, positioner),
        sent("LeftHoverArea")
      )
      assert.deepStrictEqual(scene.current.pending[0]?.command.args, {
        delay: 50
      })
      scene.resolve(
        scene.current.pending[0]!.command,
        sent("CompletedWaitBeforeClosing")
      ).emitted(dismissed("trigger-hover"))
    }))

  it.effect("shows the starting style for one frame, reports Settled, and stays drawn through its exit", () =>
    Effect.gen(function*() {
      const scene = yield* hovered({ keepMounted: true })
      assert.strictEqual(partsOf(scene).transitionStatus, "starting")
      assert.strictEqual(scene.get(popup).attrs?.["data-starting-style"], "")
      scene.mounted(mountOn(scene, portal), sent("RenderedFirstFrame"))
      assert.isUndefined(scene.get(popup).attrs?.["data-starting-style"])
      scene.mounted(
        mountOn(scene, portal),
        sent("FinishedTransition", { open: true })
      )
        .emitted({ _tag: "Settled", open: true })
      scene.props({ open: false, keepMounted: true, holdExit: true })
      assert.strictEqual(partsOf(scene).transitionStatus, "ending")
      scene.mounted(
        mountOn(scene, portal),
        sent("FinishedTransition", { open: false })
      )
      assert.isTrue(scene.get(portal).props?.popoverOpen)
      scene.props({ open: false, keepMounted: true })
      scene.mounted(
        mountOn(scene, portal),
        sent("FinishedTransition", { open: false })
      )
        .emitted({
          _tag: "Settled",
          open: false
        })
      assert.isFalse(scene.get(portal).props?.popoverOpen)
      assert.strictEqual(scene.get(popup).attrs?.["data-closed"], "")
    }))
})
