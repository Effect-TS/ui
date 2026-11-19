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
  view: (s: Parts, h: H) =>
    h.div(
      s.trigger(h.button.class("open").attr("aria-expanded", "mixed").attr("data-popup-open", "")).children("Open"),
      s.portal(h.dialog.attr("id", "mine").attr("aria-describedby", "extra").attr("style", "z-index:2"))?.children(
        s.backdrop(h.div.class("backdrop").attr("role", "none").attr("data-closed", "")),
        s.viewport(h.div.class("viewport").attr("data-nested", "")).children(
          s.popup(h.div.class("popup").attr("data-open", "").attr("tabindex", "0")).children(
            s.title(h.h2.attr("id", "heading")).children("Settings"),
            s.description(h.p).children("For this workspace."),
            s.initialFocus(h.input),
            s.close(h.button.class("shut")).children("Close")
          )
        )
      ),
      s.finalFocus(h.button.class("next")).children("Next")
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
const listener = (s: Rendered): TrackDialog | undefined =>
  (s.get(portal) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as TrackDialog | undefined
const tracked = (s: Rendered): TrackDialog => listener(s)!
// A message the mount sends, as its Stream would.
const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never

// The plain values the parts carry now.
const partsOf = (s: { readonly parts: (f: (parts: Parts) => void) => unknown }): Parts => {
  let parts: Parts | undefined
  s.parts((current) => {
    parts = current
  })
  return parts!
}

const dismissed = (reason: string) => ({ _tag: "Dismissed", reason }) as DialogEvents

describe("Dialog", () => {
  it.effect("a trigger press asks to open, and a second one, with the dialog open, to close", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: false }, standIn)
      // Closed, the portal isn't drawn, and the trigger says so.
      assert.isUndefined(s.query(portal))
      assert.deepInclude(s.get(trigger).attrs, { "aria-haspopup": "dialog", "aria-expanded": "false", class: "open" })
      assert.isUndefined(s.get(trigger).attrs?.["aria-controls"])
      assert.isUndefined(s.get(trigger).attrs?.["data-popup-open"])
      assert.isNull(partsOf(s).openMethod)
      s.click(trigger).emitted({ _tag: "Opened", triggerId: null })
      // The press records how it opened, before the consumer opens it.
      assert.strictEqual(partsOf(s).openMethod, "mouse")

      s.props({ open: true })
      s.expectMount(tracked(s))
      const id = s.get(portal).attrs?.id
      assert.notStrictEqual(id, "mine")
      assert.deepInclude(s.get(trigger).attrs, { "aria-expanded": "true", "aria-controls": id, "data-popup-open": "" })
      // Enter or Space on the trigger is a click with no pointer.
      s.fire(trigger, "click", { button: 0, x: 0, y: 0, pointerType: "" })
        .emitted(dismissed("trigger-press"))
      assert.strictEqual(partsOf(s).closeMethod, "keyboard")
    }))

  it.effect("labels a modal portal with the title and description, and resets its box", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true }, standIn)
      s.expectMount(tracked(s))
      const dialog = s.get(portal)
      assert.strictEqual(dialog.props?.open, "modal")
      assert.isUndefined(dialog.attrs?.popover)
      assert.isUndefined(dialog.attrs?.["aria-modal"])
      assert.strictEqual(dialog.attrs?.["aria-labelledby"], s.get(Locator.tag("h2")).attrs?.id)
      assert.notStrictEqual(s.get(Locator.tag("h2")).attrs?.id, "heading")
      // A token list keeps the consumer's tokens.
      assert.strictEqual(dialog.attrs?.["aria-describedby"], "extra " + s.get(Locator.tag("p")).attrs?.id)
      assert.match(dialog.attrs?.style ?? "", /^z-index:2;position:fixed;inset:0;width:0;height:0;/)
      assert.deepInclude(s.get(backdrop).attrs, { role: "presentation", "data-open": "", "data-starting-style": "" })
      assert.isUndefined(s.get(backdrop).attrs?.["data-closed"])
      assert.isUndefined(s.get(backdrop).attrs?.["data-ending-style"])
      assert.deepInclude(s.get(popup).attrs, { tabindex: "-1", style: "--nested-dialogs:0" })
      assert.isUndefined(s.get(viewport).attrs?.["data-nested"])
      assert.strictEqual(s.get(Locator.tag("input")).attrs?.autofocus, "")
      assert.strictEqual(s.get(Locator.text("Next", { exact: true })).attrs?.["data-final-focus"], dialog.attrs?.id)
      assert.deepStrictEqual(tracked(s).args, {
        modal: true,
        open: true,
        mounted: false,
        topmost: true,
        dismissible: true,
        initialFocus: true,
        finalFocus: true,
        openMethod: null,
        portalId: dialog.attrs?.id,
        popupId: s.get(popup).attrs?.id,
        triggerId: null,
        holdExit: false
      })
    }))

  it.effect("an id names the portal, and openMethod stands in for the press the dialog didn't see", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true, id: "settings", openMethod: "touch" }, standIn)
      s.expectMount(tracked(s))
      assert.strictEqual(s.get(portal).attrs?.id, "settings")
      assert.strictEqual(s.get(trigger).attrs?.["aria-controls"], "settings")
      assert.strictEqual(partsOf(s).openMethod, "touch")
      assert.include(tracked(s).args, { portalId: "settings", openMethod: "touch" })
      // Without it, the dialog's own trigger press counts.
      s.props({ open: true, id: "settings" })
      s.expectMount(tracked(s))
      assert.isNull(partsOf(s).openMethod)
    }))

  it.effect("a close the browser forces after an uncancelable request is that request, not another", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true }, standIn)
      s.expectMount(tracked(s))
      s.fire(portal, "cancel", { cancelable: true }).emitted(dismissed("escape-key"))
      s.fire(portal, "cancel", { cancelable: false }).emitted(dismissed("escape-key"))
      s.fire(portal, "close", { returnValue: "" })
      assert.deepStrictEqual(s.current.emitted, [])
      // A later close without a request, as from a form, is one.
      s.fire(portal, "close", { returnValue: "" }).emitted(dismissed("escape-key"))
    }))

  it.effect("holdExit keeps a closed dialog shown until the consumer lets it go", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true }, standIn)
      s.expectMount(tracked(s)).mounted(tracked(s), sent("RenderedFirstFrame"))
      s.props({ open: false, holdExit: true })
      s.expectMount(tracked(s))
      assert.include(tracked(s).args, { open: false, holdExit: true })
      // Its animations ending doesn't end the exit.
      s.mounted(tracked(s), sent("FinishedTransition", { open: false }))
      assert.deepStrictEqual(s.current.emitted, [])
      assert.strictEqual(s.get(popup).attrs?.["data-ending-style"], "")
      assert.isTrue(partsOf(s).mounted)
      // Let go, the mount waits for them again, and then it ends.
      s.props({ open: false, holdExit: false })
      s.expectMount(tracked(s))
        .mounted(tracked(s), sent("FinishedTransition", { open: false }))
        .emitted({ _tag: "Settled", open: false })
      assert.isUndefined(s.query(portal))
    }))

  it.effect("Escape, a forced close, the close part, a press outside and focus leaving each ask to close", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true }, standIn)
      s.expectMount(tracked(s))
      s.fire(portal, "cancel").emitted(dismissed("escape-key"))
      // The consumer refused, and the browser closed it anyway.
      s.fire(portal, "close", { returnValue: "" }).emitted(dismissed("escape-key"))
      s.fire(close, "click", { button: 0, x: 0, y: 0, pointerType: "touch" }).emitted(dismissed("close-press"))
      assert.strictEqual(partsOf(s).closeMethod, "touch")
      s.mounted(tracked(s), sent("PressedOutside", { pointerType: "pen" })).emitted(dismissed("outside-press"))
      assert.strictEqual(partsOf(s).closeMethod, "pen")
      // A modal hears Escape through its cancel, and only a dialog that
      // isn't one closes when focus leaves.
      s.mounted(tracked(s), sent("FocusedOutside"))
      assert.deepStrictEqual(s.current.emitted, [])
      s.props({ open: true, modal: false })
      s.expectMount(tracked(s))
        .mounted(tracked(s), sent("FocusedOutside"))
        .emitted(dismissed("focus-out"))
      s.mounted(tracked(s), sent("PressedEscape")).emitted(dismissed("escape-key"))
      // With pointer dismissal off, neither a press outside nor focus leaving does.
      s.props({ open: true, modal: false, disablePointerDismissal: true })
      s.expectMount(tracked(s))
        .mounted(tracked(s), sent("PressedOutside", { pointerType: "mouse" }))
        .mounted(tracked(s), sent("FocusedOutside"))
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it.effect("a close of the consumer's own is no request", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true, keepMounted: true }, standIn)
      s.expectMount(tracked(s))
      s.props({ open: false, keepMounted: true })
      s.fire(portal, "close", { returnValue: "" }).fire(portal, "cancel")
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it.effect("starts and ends with a transition, and stays shown until its exit finishes", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true }, standIn)
      s.expectMount(tracked(s))
      assert.strictEqual(partsOf(s).transitionStatus, "starting")
      s.mounted(tracked(s), sent("RenderedFirstFrame"))
      assert.isNull(partsOf(s).transitionStatus)
      for (const part of [backdrop, viewport, popup]) {
        assert.strictEqual(s.get(part).attrs?.["data-open"], "")
        assert.isUndefined(s.get(part).attrs?.["data-starting-style"])
      }
      s.expectMount(tracked(s))
        .mounted(tracked(s), sent("FinishedTransition", { open: true }))
        .emitted({ _tag: "Settled", open: true })

      s.props({ open: false })
      s.expectMount(tracked(s))
      // Closing: still a modal, with the closed and ending attributes.
      assert.strictEqual(s.get(portal).props?.open, "modal")
      assert.strictEqual(partsOf(s).transitionStatus, "ending")
      assert.isTrue(partsOf(s).mounted)
      for (const part of [backdrop, viewport, popup]) {
        assert.deepInclude(s.get(part).attrs, { "data-closed": "", "data-ending-style": "" })
        assert.isUndefined(s.get(part).attrs?.["data-open"])
      }
      // A stale end, from before the dialog reopened, is ignored.
      s.mounted(tracked(s), sent("FinishedTransition", { open: true }))
      assert.deepStrictEqual(s.current.emitted, [])
      s.mounted(tracked(s), sent("FinishedTransition", { open: false }))
        .emitted({ _tag: "Settled", open: false })
      assert.isUndefined(s.query(portal))
      assert.isFalse(partsOf(s).mounted)
    }))

  it.effect("keepMounted keeps a closed portal, hidden and without its mount", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: false, keepMounted: true }, standIn)
      assert.strictEqual(s.get(portal).props?.open, false)
      assert.isUndefined(listener(s))
      assert.deepInclude(s.get(popup).attrs, { "data-closed": "" })
    }))

  it.effect("the other modes show the dialog as a manual popover", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true, modal: "trap-focus" }, standIn)
      s.expectMount(tracked(s))
      assert.deepInclude(s.get(portal).attrs, { popover: "manual", "aria-modal": "true" })
      assert.deepInclude(s.get(portal).props, { open: false, popoverOpen: true })
      s.props({ open: true, modal: false })
      s.expectMount(tracked(s))
      assert.isUndefined(s.get(portal).attrs?.["aria-modal"])
      assert.strictEqual(s.get(portal).props?.popoverOpen, true)
      // The cancel and close a modal hears aren't handled.
      assert.isUndefined((s.get(portal) as unknown as View.Element<unknown>).owned?.[0]?.handlers.cancel)
    }))

  it.effect("a nested dialog draws no backdrop, and the dialog above it stops hearing dismissals", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true }, standIn)
      s.expectMount(tracked(s))
      s.shared(Dialog, { open: true })
      assert.isTrue(partsOf(s).nested)
      assert.isUndefined(s.query(backdrop))
      assert.strictEqual(s.get(viewport).attrs?.["data-nested"], "")
      assert.strictEqual(s.get(popup).attrs?.["data-nested"], "")
      s.props({ open: true, forceRenderBackdrop: true })
      assert.isDefined(s.query(backdrop))

      // One dialog open inside this one, and one inside that.
      s.collected([2, 0])
      assert.strictEqual(partsOf(s).nestedDialogs, 2)
      assert.strictEqual(s.get(popup).attrs?.["data-nested-dialog-open"], "")
      assert.strictEqual(s.get(popup).attrs?.style, "--nested-dialogs:2")
      s.expectMount(tracked(s))
      assert.isFalse((tracked(s).args as { readonly topmost: boolean }).topmost)
      s.fire(portal, "cancel")
        .mounted(tracked(s), sent("PressedEscape"))
        .mounted(tracked(s), sent("PressedOutside", { pointerType: "mouse" }))
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it.effect("with several triggers, the open one closes it and another one asks for itself", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: false }, {
        elements: Html,
        view: (s: Parts, h: H) =>
          h.div(
            s.trigger(h.button.attr("id", "edit-a")).children("A"),
            s.trigger(h.button.attr("id", "edit-b")).children("B"),
            s.portal(h.dialog)?.children(s.popup(h.div).children("Edit"))
          )
      })
      const a = Locator.text("A", { exact: true })
      const b = Locator.text("B", { exact: true })
      s.click(a).emitted({ _tag: "Opened", triggerId: "edit-a" })
      assert.strictEqual(partsOf(s).openMethod, "mouse")
      s.props({ open: true, triggerId: "edit-a" })
      s.expectMount(tracked(s))
      assert.strictEqual(s.get(a).attrs?.["aria-expanded"], "true")
      assert.strictEqual(s.get(b).attrs?.["aria-expanded"], "false")
      assert.isUndefined(s.get(b).attrs?.["data-popup-open"])
      s.click(b).emitted({ _tag: "Opened", triggerId: "edit-b" })
      s.click(a).emitted(dismissed("trigger-press"))
    }))

  it.effect("initialFocus and finalFocus false reach the mount, and drop autofocus", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Dialog, { open: true, initialFocus: false, finalFocus: false }, standIn)
      s.expectMount(tracked(s))
      assert.isUndefined(s.get(Locator.tag("input")).attrs?.autofocus)
      assert.deepInclude(tracked(s).args, { initialFocus: false, finalFocus: false })
    }))

  it.effect("each part takes only its own tags", () =>
    Effect.gen(function*() {
      const parts = (view: (s: Parts, h: H) => View.Child<never>) =>
        Effect.flip(Scene.make(Dialog, { open: true }, { elements: Html, view }))
      for (
        const view of [
          (s: Parts, h: H) => s.trigger(h.div as any),
          (s: Parts, h: H) => s.portal(h.div as any),
          (s: Parts, h: H) => s.title(h.p as any),
          (s: Parts, h: H) => s.description(h.div as any),
          (s: Parts, h: H) => s.close(h.a as any),
          (s: Parts, h: H) => s.popup(h.span as any)
        ]
      ) {
        const error = yield* parts(view).pipe(Effect.catchDefect((defect) => Effect.succeed(defect)))
        assert.match(String(error), /a part for <[^>]+(> or <h\d)*> was given </)
      }
    }))
})

// Two dialogs, one in the other's popup, open from the start.
const NestedMessage = UiSchema.TaggedEnum({ DismissedInner: {} })
const Nested = Component.define({
  name: "Nested",
  model: Schema.Struct({ inner: Schema.Boolean }),
  message: NestedMessage,
  elements: Html
}).make({
  init: () => ({ inner: true }),
  update: (model, message) => NestedMessage.match(message, { DismissedInner: () => ({ ...model, inner: false }) }),
  view: (model, h) =>
    Dialog(h, {
      key: "outer",
      props: { open: true },
      view: (outer) =>
        h.div(
          outer.portal(h.dialog)?.children(
            outer.backdrop(h.div.class("outer-backdrop")),
            outer.popup(h.div.class("outer")).children(
              Dialog(h, {
                key: "inner",
                props: { open: model.inner },
                onEmit: {
                  Opened: () => undefined,
                  Dismissed: () => NestedMessage.DismissedInner(),
                  Settled: () => undefined
                },
                view: (inner) =>
                  h.div(
                    inner.trigger(h.button).children("Confirm"),
                    inner.portal(h.dialog)?.children(
                      inner.backdrop(h.div.class("inner-backdrop")),
                      inner.popup(h.div.class("inner")).children(inner.close(h.button).children("Keep"))
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
    // Given the dialog's id, it points at the dialog while it is open.
    const paired = (open: boolean) =>
      View.build(DialogTrigger(h, { props: { open, popupId: "settings" } }), []) as View.Element<string>
    assert.strictEqual(paired(true).attrs["aria-controls"], "settings")
    assert.isUndefined(paired(false).attrs["aria-controls"])
    assert.strictEqual(paired(false).attrs["data-dialog-trigger"], "settings")
  })

  it("onPress as a function hears the trigger's id and how it was pressed", () => {
    const built = View.build(
      DialogTrigger(h, {
        element: h.button.attr("id", "settings-button"),
        props: { open: false },
        onPress: ({ method, triggerId }) => `${triggerId} ${method}`
      }),
      []
    ) as View.Element<string>
    const click = built.handlers.click as (payload: { readonly pointerType: string }) => string
    assert.strictEqual(click({ pointerType: "touch" }), "settings-button touch")
    assert.strictEqual(click({ pointerType: "" }), "settings-button keyboard")
    const anonymous = View.build(
      DialogTrigger(h, { props: { open: false }, onPress: ({ triggerId }) => String(triggerId) }),
      []
    ) as View.Element<string>
    assert.strictEqual((anonymous.handlers.click as (payload: object) => string)({ pointerType: "mouse" }), "null")
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
