import type { Mount } from "@effect/ui"
import { Component, UiSchema, View } from "@effect/ui"
import { Dialog, type DialogEvents, type DialogProps, DialogTrigger } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

type Parts = Component.Headless.Parts<typeof Dialog>
type H = View.Helper<never, DialogProps> & View.Tags<Html.Elements, never>

// Every part, with a consumer value for each attribute the dialog owns, so
// a test sees the dialog's win.
const standIn = {
  elements: Html,
  view: (dialog: Parts, h: H) =>
    h.div(
      dialog.trigger(h.button.class("open").attr("aria-expanded", "mixed").attr("data-popup-open", "")).children(
        "Open"
      ),
      dialog.trigger(h.button.attr("id", "other")).children("Other"),
      dialog.portal(h.dialog.attr("id", "mine").attr("aria-describedby", "extra").attr("style", "z-index:2"))?.children(
        dialog.backdrop(h.div.class("backdrop").attr("role", "none").attr("data-closed", "")),
        dialog.viewport(h.div.class("viewport").attr("data-nested", "")).children(
          dialog.popup(h.div.class("popup").attr("data-open", "").attr("tabindex", "0")).children(
            dialog.title(h.h2.attr("id", "heading")).children("Settings"),
            dialog.description(h.p).children("For this workspace."),
            dialog.initialFocus(h.input),
            dialog.close(h.button.class("shut")).children("Close")
          )
        )
      ),
      dialog.finalFocus(h.button.class("next")).children("Next")
    )
}

const trigger = Locator.text("Open", { exact: true })
const close = Locator.text("Close", { exact: true })
const portal = Locator.tag("dialog")
const popup = Locator.attr("class", "popup")
const viewport = Locator.attr("class", "viewport")
const backdrop = Locator.attr("class", "backdrop")

type TrackDialog = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
// The portal's mount is private, so a test reads it off the rendered element.
const tracked = (s: Rendered): TrackDialog =>
  (s.get(portal) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as TrackDialog
// A message the mount sends, as its Stream would.
const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never

// The plain values the parts carry now.
const partsOf = (s: { readonly parts: (f: (dialog: Parts) => void) => unknown }): Parts => {
  let parts: Parts | undefined
  s.parts((dialog) => {
    parts = dialog
  })
  return parts!
}

const dismissed = (reason: string) => ({ _tag: "Dismissed", reason }) as DialogEvents

describe("Dialog", () => {
  it.effect("remembers the trigger that opened it, and only that one asks to close it", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: false }, standIn)
      const other = Locator.text("Other", { exact: true })
      assert.isUndefined(s.query(portal))
      assert.deepInclude(s.get(trigger).attrs, {
        type: "button",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
        class: "open"
      })
      assert.isUndefined(s.get(trigger).attrs?.["aria-controls"])
      assert.isUndefined(s.get(trigger).attrs?.["data-popup-open"])
      assert.isString(s.get(trigger).attrs?.id)
      assert.strictEqual(s.get(other).attrs?.id, "other")
      s.click(trigger).emitted({ _tag: "Opened", triggerId: null })
      assert.isNull(partsOf(s).openMethod)
      s.props({ open: true })
      s.expectMount(tracked(s))
      assert.strictEqual(partsOf(s).openMethod, "mouse")
      const id = s.get(portal).attrs?.id
      assert.notStrictEqual(id, "mine")
      assert.deepInclude(s.get(trigger).attrs, { "aria-expanded": "true", "aria-controls": id, "data-popup-open": "" })
      assert.deepInclude(s.get(other).attrs, { "aria-expanded": "false" })
      s.click(other).emitted({ _tag: "Opened", triggerId: "other" })
      assert.deepInclude(s.get(other).attrs, { "aria-expanded": "true", "aria-controls": id })
      assert.strictEqual(s.get(trigger).attrs?.["aria-expanded"], "false")
      // Enter or Space on the trigger is a click with no pointer.
      s.fire(other, "click", { button: 0, x: 0, y: 0, pointerType: "" })
        .emitted(dismissed("trigger-press"))
      assert.strictEqual(partsOf(s).closeMethod, "keyboard")
      s.props({ open: true, triggerId: s.get(trigger).attrs?.id ?? null })
      s.expectMount(tracked(s))
      assert.strictEqual(s.get(trigger).attrs?.["aria-expanded"], "true")
      assert.strictEqual(s.get(other).attrs?.["aria-expanded"], "false")
      s.props({ open: false })
      assert.isNull(partsOf(s).openMethod)
    }))

  it.effect("labels the portal with the drawn title and description, and draws a layer for a modal", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true, openMethod: "touch" }, standIn)
      s.expectMount(tracked(s))
      assert.strictEqual(partsOf(s).openMethod, "touch")
      const dialog = s.get(portal)
      assert.deepInclude(dialog.props, { open: false, popoverOpen: true })
      assert.strictEqual(dialog.attrs?.popover, "manual")
      assert.isUndefined(dialog.attrs?.["aria-modal"])
      assert.strictEqual(dialog.attrs?.["aria-labelledby"], "heading")
      assert.strictEqual(s.get(Locator.tag("h2")).attrs?.id, "heading")
      // A token list keeps the consumer's tokens.
      assert.strictEqual(dialog.attrs?.["aria-describedby"], "extra " + s.get(Locator.tag("p")).attrs?.id)
      assert.match(dialog.attrs?.style ?? "", /^z-index:2;position:fixed;inset:0;width:0;height:0;/)
      const [layer] = (dialog as View.Element<unknown>).children as ReadonlyArray<View.Element<unknown>>
      assert.deepInclude(layer!.attrs, { role: "presentation" })
      assert.isUndefined(layer!.attrs.inert)
      assert.match(layer!.attrs.style ?? "", /^position:fixed;inset:0;user-select:none/)
      assert.deepInclude(s.get(backdrop).attrs, {
        role: "presentation",
        "data-open": "",
        "data-starting-style": "",
        style: "user-select:none;-webkit-user-select:none"
      })
      assert.isUndefined(s.get(backdrop).attrs?.["data-closed"])
      assert.isUndefined(s.get(backdrop).attrs?.["data-ending-style"])
      assert.deepInclude(s.get(viewport).attrs, { role: "presentation" })
      assert.isUndefined(s.get(viewport).attrs?.style)
      assert.deepInclude(s.get(popup).attrs, { tabindex: "-1", style: "--nested-dialogs:0" })
      assert.isUndefined(s.get(viewport).attrs?.["data-nested"])
      assert.strictEqual(s.get(close).attrs?.type, "button")
      assert.strictEqual(s.get(Locator.tag("input")).attrs?.autofocus, "")
      assert.strictEqual(s.get(Locator.text("Next", { exact: true })).attrs?.["data-final-focus"], dialog.attrs?.id)
    }))

  it.effect("names no title or description that isn't drawn", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true }, {
        elements: Html,
        view: (dialog: Parts, h: H) =>
          h.div(
            dialog.portal(h.dialog.attr("aria-labelledby", "outside"))?.children(dialog.popup(h.div.class("popup")))
          )
      })
      s.expectMount(tracked(s))
      assert.strictEqual(s.get(portal).attrs?.["aria-labelledby"], "outside")
      assert.isUndefined(s.get(portal).attrs?.["aria-describedby"])
    }))

  it.effect("reports close methods and ignores outside dismissal when disabled", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true }, standIn)
      s.expectMount(tracked(s))
      s.mounted(tracked(s), sent("PressedEscape")).emitted(dismissed("escape-key"))
      s.fire(close, "click", { button: 0, x: 0, y: 0, pointerType: "touch" }).emitted(dismissed("close-press"))
      assert.strictEqual(partsOf(s).closeMethod, "touch")
      s.mounted(tracked(s), sent("PressedOutside", { pointerType: "pen" })).emitted(dismissed("outside-press"))
      assert.strictEqual(partsOf(s).closeMethod, "pen")
      // With pointer dismissal off, neither a press outside nor focus leaving does.
      s.props({ open: true, modal: false, disablePointerDismissal: true })
      s.expectMount(tracked(s))
        .mounted(tracked(s), sent("PressedOutside", { pointerType: "mouse" }))
        .mounted(tracked(s), sent("FocusedOutside"))
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it.effect("reports transition state and waits for holdExit to be released before settling", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true }, standIn)
      s.expectMount(tracked(s))
      assert.strictEqual(partsOf(s).transitionStatus, "starting")
      s.mounted(tracked(s), sent("ShowedPortal")).mounted(tracked(s), sent("RenderedFirstFrame"))
      assert.isNull(partsOf(s).transitionStatus)
      for (const part of [backdrop, viewport, popup]) {
        assert.strictEqual(s.get(part).attrs?.["data-open"], "")
        assert.isUndefined(s.get(part).attrs?.["data-starting-style"])
      }
      s.expectMount(tracked(s))
        .mounted(tracked(s), sent("FinishedTransition", { open: true }))
        .emitted({ _tag: "Settled", open: true })

      s.props({ open: false, holdExit: true })
      s.expectMount(tracked(s))
      assert.strictEqual(s.get(portal).props?.popoverOpen, true)
      assert.strictEqual(partsOf(s).transitionStatus, "ending")
      assert.isTrue(partsOf(s).mounted)
      for (const part of [backdrop, viewport, popup]) {
        assert.deepInclude(s.get(part).attrs, { "data-closed": "", "data-ending-style": "" })
        assert.isUndefined(s.get(part).attrs?.["data-open"])
      }
      const [layer] = (s.get(portal) as View.Element<unknown>).children as ReadonlyArray<View.Element<unknown>>
      assert.strictEqual(layer!.attrs.inert, "")
      assert.match(s.get(backdrop).attrs?.style ?? "", /pointer-events:none$/)
      assert.strictEqual(s.get(viewport).attrs?.style, "pointer-events:none")
      // Its animations ending doesn't end the exit.
      s.mounted(tracked(s), sent("FinishedTransition", { open: false }))
      assert.deepStrictEqual(s.current.emitted, [])
      // Let go, the mount waits for them again, and then it ends.
      s.props({ open: false, holdExit: false })
      s.expectMount(tracked(s))
      // An opening animation that finishes late must not settle this exit.
      s.mounted(tracked(s), sent("FinishedTransition", { open: true }))
      assert.deepStrictEqual(s.current.emitted, [])
      s.mounted(tracked(s), sent("FinishedTransition", { open: false }))
        .emitted({ _tag: "Settled", open: false })
      assert.isUndefined(s.query(portal))
    }))

  it.effect("keepMounted leaves a hidden portal with no layer", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: false, keepMounted: true }, standIn)
      assert.deepInclude(s.get(portal).props, { open: false, popoverOpen: false })
      assert.deepInclude(s.get(popup).attrs, { "data-closed": "" })
      assert.strictEqual(
        ((s.get(portal) as View.Element<unknown>).children[0] as View.Element<unknown>).attrs.class,
        "backdrop"
      )
    }))

  it.effect("the other modes draw no layer and no aria-modal", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true, modal: "trap-focus" }, standIn)
      s.expectMount(tracked(s))
      assert.deepInclude(s.get(portal).attrs, { popover: "manual" })
      assert.isUndefined(s.get(portal).attrs?.["aria-modal"])
      assert.deepInclude(s.get(portal).props, { open: false, popoverOpen: true })
      assert.strictEqual(
        ((s.get(portal) as View.Element<unknown>).children[0] as View.Element<unknown>).attrs.class,
        "backdrop"
      )
      s.props({ open: true, modal: false, initialFocus: false })
      assert.isUndefined(s.get(Locator.tag("input")).attrs?.autofocus)
      s.expectMount(tracked(s))
      assert.strictEqual(s.get(portal).props?.popoverOpen, true)
    }))

  it.effect("a nested dialog can force a backdrop, and a parent ignores Escape", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true }, standIn)
      s.expectMount(tracked(s))
      s.shared(Dialog, { open: true })
      assert.isTrue(partsOf(s).nested)
      s.props({ open: true, forceRenderBackdrop: true })
      assert.isDefined(s.query(backdrop))
      // One dialog open inside this one, and one inside that.
      s.collected([2, 0])
      assert.strictEqual(partsOf(s).nestedDialogs, 2)
      s.expectMount(tracked(s)).mounted(tracked(s), sent("PressedEscape"))
      assert.deepStrictEqual(s.current.emitted, [])
    }))
})

// Two dialogs, one in the other's popup, open from the start.
const NestedMessage = UiSchema.TaggedEnum({ DismissedInner: {} })
const Nested = Component.define({
  name: "Nested",
  scoped: false,
  model: Schema.Struct({ inner: Schema.Boolean }),
  message: NestedMessage,
  elements: Html
}).make({
  init: () => ({ inner: true }),
  update: {
    DismissedInner: (model) => ({ ...model, inner: false })
  },
  view: (model, h) =>
    Dialog(h, {
      key: "outer",
      props: { open: true },
      view: (outerDialog) =>
        h.div(
          outerDialog.portal(h.dialog)?.children(
            outerDialog.backdrop(h.div.class("outer-backdrop")),
            outerDialog.popup(h.div.class("outer")).children(
              Dialog(h, {
                key: "inner",
                props: { open: model.inner },
                onEmit: {
                  Opened: () => undefined,
                  Dismissed: () => NestedMessage.DismissedInner(),
                  Settled: () => undefined
                },
                view: (innerDialog) =>
                  h.div(
                    innerDialog.trigger(h.button).children("Confirm"),
                    innerDialog.portal(h.dialog)?.children(
                      innerDialog.backdrop(h.div.class("inner-backdrop")),
                      innerDialog.popup(h.div.class("inner")).children(innerDialog.close(h.button).children("Keep"))
                    )
                  )
              })
            )
          )
        )
    })
})

describe("nested dialogs", () => {
  it.effect("the outer dialog counts the open one inside it, which finds it by itself", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Nested, {})
      yield* TestHost.settle
      const outer = root.get(Locator.attr("class", "outer"))
      assert.deepInclude(outer.attrs, { "data-nested-dialog-open": "", style: "--nested-dialogs:1" })
      assert.isUndefined(outer.attrs?.["data-nested"])
      assert.strictEqual(root.get(Locator.attr("class", "inner")).attrs?.["data-nested"], "")
      assert.isDefined(root.query(Locator.attr("class", "outer-backdrop")))
      assert.isUndefined(root.query(Locator.attr("class", "inner-backdrop")))
      Locator.fire(root.get(Locator.text("Keep", { exact: true })), "click")
      yield* TestHost.settle
      assert.isUndefined(root.query(Locator.attr("class", "inner")))
      assert.isUndefined(root.get(Locator.attr("class", "outer")).attrs?.["data-nested-dialog-open"])
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})

const h = View.makeHelper<string, {}, Html.Elements>({}, Html)

describe("DialogTrigger", () => {
  it("draws a trigger for a dialog drawn elsewhere, and its attributes win", () => {
    const closed = View.build(
      DialogTrigger(h, {
        element: h.button.attr("aria-expanded", "true").attr("data-popup-open", ""),
        props: { open: false },
        onPress: "open"
      }),
      []
    ) as View.Element<string>
    assert.deepInclude(closed.attrs, { "aria-haspopup": "dialog", "aria-expanded": "false" })
    assert.isUndefined(closed.attrs["data-popup-open"])
    assert.strictEqual(closed.handlers.click, "open")
    assert.isUndefined(closed.attrs["aria-controls"])
    const open = View.build(DialogTrigger(h, { props: { open: true } }), []) as View.Element<string>
    assert.deepInclude(open.attrs, { "aria-expanded": "true", "data-popup-open": "" })
    assert.isUndefined(open.attrs["aria-controls"])
  })

  it("an anonymous detached keyboard press has no trigger id", () => {
    const anonymous = View.build(
      DialogTrigger(h, { props: { open: false }, onPress: ({ triggerId, method }) => `${triggerId} ${method}` }),
      []
    ) as View.Element<string>
    assert.strictEqual((anonymous.handlers.click as (payload: object) => string)({ pointerType: "" }), "null keyboard")
  })

  it("rejects a click handler of the caller's own only with onPress", () => {
    assert.throws(
      () => View.build(DialogTrigger(h, { props: { open: false }, onPress: "open" }).onClick("mine"), []),
      /DialogTrigger: the element already handles click/
    )
    const kept = View.build(DialogTrigger(h, { props: { open: false } }).onClick("mine"), []) as View.Element<string>
    assert.strictEqual(kept.handlers.click, "mine")
  })
})
