import type { Component, Mount, View } from "@effect/ui"
import { PreviewCard, type PreviewCardEvents, type PreviewCardProps } from "@effect/ui-kit"
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
    h.p(
      previewCard.trigger({
        element: h.a.attr("id", "typography").attr("href", "/typography").attr("data-popup-open", "x")
      }).children("Typography"),
      " and ",
      previewCard.trigger({ element: h.a.attr("href", "/kerning"), delay: 100, closeDelay: 50 }).children("Kerning"),
      previewCard.portal(h.div.class("portal").attr("style", "z-index:2"))?.children(
        previewCard.backdrop(h.div.class("backdrop")),
        previewCard.positioner(h.div.class("positioner").attr("role", "none")).children(
          previewCard.popup(h.div.class("popup").attr("tabindex", "0").attr("data-side", "x")).children(
            previewCard.arrow(h.div.class("arrow")),
            previewCard.viewport(h.div.class("viewport")).children("Preview")
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

const top = { side: "top", align: "start", anchorHidden: false, arrowUncentered: true } as const

type Track = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const mountOn = (s: Rendered, locator: Locator.Locator): Track =>
  (s.get(locator) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as Track
const running = <S extends Rendered & { readonly expectMount: (mount: Track) => S }>(s: S): S =>
  s.expectMount(mountOn(s, portal)).expectMount(mountOn(s, positioner)).expectMount(mountOn(s, viewport))
const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never

const partsOf = (s: { readonly parts: (f: (previewCard: Parts) => void) => unknown }): Parts => {
  let parts: Parts | undefined
  s.parts((previewCard) => {
    parts = previewCard
  })
  return parts!
}

const opened = (triggerId: string, reason: "trigger-hover" | "trigger-focus") =>
  ({ _tag: "Opened", triggerId, reason }) as PreviewCardEvents
const dismissed = (reason: string) => ({ _tag: "Dismissed", reason }) as PreviewCardEvents

const scene = Effect.fnUntraced(function*(props: PreviewCardProps) {
  const s = yield* HtmlScene.make(PreviewCard, props, standIn)
  return s.expectMount(mountOn(s, typography)).expectMount(mountOn(s, kerning))
})

const hovered = Effect.fnUntraced(function*(props: Partial<PreviewCardProps> = {}) {
  const s = yield* scene({ open: false, ...props })
  s.fire(typography, "mouseenter", { x: 10, y: 5 })
  s.resolve(s.current.pending[0]!.command, sent("CompletedWaitBeforeOpening"))
    .emitted(opened("typography", "trigger-hover"))
  running(s.props({ ...props, open: true, triggerId: "typography" }))
  s.mounted(mountOn(s, portal), sent("ShowedPortal"))
  return s
})

describe("PreviewCard", () => {
  it.effect("opens once the mouse rests on a link that announces nothing, with a popup that takes no Tab", () =>
    Effect.gen(function*() {
      const s = yield* scene({ open: false, sideOffset: 8 })
      assert.isUndefined(s.query(portal))
      const link = s.get(typography).attrs ?? {}
      assert.deepInclude(link, { id: "typography", href: "/typography" })
      for (const name of ["aria-expanded", "aria-haspopup", "aria-controls", "data-popup-open"]) {
        assert.isUndefined(link[name], name)
      }
      assert.isString(s.get(kerning).attrs?.id)

      s.fire(typography, "mouseenter", { x: 10, y: 5 })
      const [opening] = s.current.pending
      assert.deepStrictEqual(opening?.command.args, { delay: 600 })
      s.resolve(opening!.command, sent("CompletedWaitBeforeOpening")).emitted(opened("typography", "trigger-hover"))
      running(s.props({ open: true, triggerId: "typography", sideOffset: 8 }))

      const cardId = s.get(portal).attrs?.id
      assert.isString(cardId)
      assert.isTrue(s.get(portal).props?.popoverOpen)
      assert.match(s.get(portal).attrs?.style ?? "", /^z-index:2;.*;position:absolute;inset:0 auto auto 0$/)
      assert.deepInclude(s.get(typography).attrs, { "data-popup-open": "", "data-preview-card-trigger": cardId })
      assert.isUndefined(s.get(kerning).attrs?.["data-popup-open"])
      assert.deepInclude(s.get(positioner).attrs, {
        role: "presentation",
        "data-open": "",
        "data-side": "bottom",
        "data-align": "center"
      })
      const card = s.get(popup).attrs ?? {}
      assert.deepInclude(card, { tabindex: "-1", "data-open": "", "data-side": "bottom" })
      assert.isUndefined(card.role)
      assert.isUndefined(card["data-instant"])
      assert.deepInclude(s.get(backdrop).attrs, { role: "presentation", "data-open": "" })
      assert.include(s.get(backdrop).attrs?.style, "pointer-events:none")

      s.mounted(mountOn(s, positioner), sent("ChangedPlacement", { placement: top }))
      assert.deepInclude(s.get(popup).attrs, { "data-side": "top", "data-align": "start" })
      assert.deepInclude(s.get(arrow).attrs, { "aria-hidden": "true", "data-side": "top", "data-uncentered": "" })
      const parts = partsOf(s)
      assert.deepInclude(parts, { open: true, triggerId: "typography", openReason: "trigger-hover", side: "top" })
    }))

  it.effect("waits out the close delay once the pointer has left the link and the card, and coming back holds it", () =>
    Effect.gen(function*() {
      const s = yield* hovered()
      s.fire(typography, "mouseleave", { x: 10, y: 15 })
      assert.deepStrictEqual(s.current.pending, [])
      s.mounted(mountOn(s, positioner), sent("LeftHoverArea"))
      const [closing] = s.current.pending
      assert.strictEqual(closing?.command.name, "WaitBeforeClosing")
      assert.deepStrictEqual(closing?.command.args, { delay: 300 })
      s.mounted(mountOn(s, positioner), sent("ReturnedToHoverArea"))
      assert.deepStrictEqual(s.current.interrupted.map((c) => c.name), ["WaitBeforeClosing"])
      s.mounted(mountOn(s, positioner), sent("LeftHoverArea"))
      s.resolve(s.current.pending[0]!.command, sent("CompletedWaitBeforeClosing")).emitted(dismissed("trigger-hover"))
    }))

  it.effect("keyboard focus opens after the delay without a transition, and holds the card while it stays", () =>
    Effect.gen(function*() {
      const s = yield* scene({ open: false })
      s.fire(typography, "focus", { focusVisible: true })
      assert.deepStrictEqual(s.current.pending[0]?.command.args, { delay: 600 })
      s.resolve(s.current.pending[0]!.command, sent("CompletedWaitBeforeOpening"))
        .emitted(opened("typography", "trigger-focus"))
      running(s.props({ open: true, triggerId: "typography" }))
      for (const part of [positioner, popup, viewport]) {
        assert.strictEqual(s.get(part).attrs?.["data-instant"], "focus")
      }
      s.mounted(mountOn(s, positioner), sent("LeftHoverArea"))
      assert.deepStrictEqual(s.current.pending, [])
      s.fire(typography, "blur", { disabled: false })
        .mounted(mountOn(s, positioner), sent("FocusedPopup"))
        .mounted(mountOn(s, positioner), sent("LeftHoverArea"))
      assert.deepStrictEqual(s.current.pending, [])
      s.mounted(mountOn(s, positioner), sent("BlurredPopup"))
        .mounted(mountOn(s, positioner), sent("FocusedOutside"))
        .emitted(dismissed("trigger-focus"))
    }))

  it.effect("a touch during the hover delay cancels opening", () =>
    Effect.gen(function*() {
      const s = yield* scene({ open: false })
      const touch = { button: 0, x: 0, y: 0, shift: false, ctrl: false, alt: false, meta: false, pointerType: "touch" }
      s.fire(typography, "mouseenter", { x: 1, y: 1 })
        .fire(typography, "mousedown", touch)
      assert.deepStrictEqual(s.current.pending, [])
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it.effect("a pointer given back by a layer that covered the link is no new hover", () =>
    Effect.gen(function*() {
      const s = yield* scene({ open: false })
      s.fire(typography, "mouseenter", { x: 3, y: 4 })
        .fire(typography, "mouseleave", { x: 3, y: 4 })
        .fire(typography, "mouseenter", { x: 3, y: 4 })
      assert.deepStrictEqual(s.current.pending, [])
      s.fire(typography, "mouseleave", { x: 3, y: 4 }).fire(typography, "mouseenter", { x: 5, y: 4 })
      s.resolve(s.current.pending[0]!.command, sent("CompletedWaitBeforeOpening"))
        .emitted(opened("typography", "trigger-hover"))
    }))

  it.effect("Escape asks to close and marks the exit as an instant dismiss", () =>
    Effect.gen(function*() {
      const s = yield* hovered()
      s.fireDocument("keydown", { key: "Escape" }).emitted(dismissed("escape-key"))
      s.props({ open: false, triggerId: "typography" })
      assert.deepInclude(s.get(positioner).attrs, { "data-closed": "", "data-instant": "dismiss" })
      assert.deepInclude(s.get(popup).attrs, { "data-ending-style": "", "data-instant": "dismiss" })
      assert.isFalse(partsOf(s).open)
      assert.isTrue(partsOf(s).mounted)
    }))

  it.effect("another link moves an open card to it at once", () =>
    Effect.gen(function*() {
      const s = yield* hovered()
      const other = s.get(kerning).attrs?.id ?? ""
      s.fire(typography, "mouseleave", { x: 10, y: 15 }).fire(kerning, "mouseenter", { x: 50, y: 5 })
        .emitted(opened(other, "trigger-hover"))
      s.props({ open: true, triggerId: other })
      assert.strictEqual(s.get(kerning).attrs?.["data-popup-open"], "")
      assert.isUndefined(s.get(typography).attrs?.["data-popup-open"])
      s.fire(kerning, "mouseleave", { x: 50, y: 15 }).mounted(mountOn(s, positioner), sent("LeftHoverArea"))
      assert.deepStrictEqual(s.current.pending[0]?.command.args, { delay: 50 })
      s.resolve(s.current.pending[0]!.command, sent("CompletedWaitBeforeClosing")).emitted(dismissed("trigger-hover"))
    }))

  it.effect("shows the starting style for one frame, reports Settled, and stays drawn through its exit", () =>
    Effect.gen(function*() {
      const s = yield* hovered({ keepMounted: true })
      assert.strictEqual(partsOf(s).transitionStatus, "starting")
      assert.strictEqual(s.get(popup).attrs?.["data-starting-style"], "")
      s.mounted(mountOn(s, portal), sent("RenderedFirstFrame"))
      assert.isUndefined(s.get(popup).attrs?.["data-starting-style"])
      s.mounted(mountOn(s, portal), sent("FinishedTransition", { open: true })).emitted({ _tag: "Settled", open: true })
      s.props({ open: false, keepMounted: true, holdExit: true })
      assert.strictEqual(partsOf(s).transitionStatus, "ending")
      s.mounted(mountOn(s, portal), sent("FinishedTransition", { open: false }))
      assert.isTrue(s.get(portal).props?.popoverOpen)
      s.props({ open: false, keepMounted: true })
      s.mounted(mountOn(s, portal), sent("FinishedTransition", { open: false })).emitted({
        _tag: "Settled",
        open: false
      })
      assert.isFalse(s.get(portal).props?.popoverOpen)
      assert.strictEqual(s.get(popup).attrs?.["data-closed"], "")
    }))
})
