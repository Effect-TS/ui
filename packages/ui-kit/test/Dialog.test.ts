import { type Component, type Mount, UiSchema, View } from "@effect/ui"
import {
  Dialog,
  type DialogEvents,
  type DialogProps,
  DialogTrigger
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
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
      dialog.trigger(
        h.button.class("open").attrs({
          "aria-expanded": "mixed",
          "data-popup-open": ""
        })
      ).children(
        "Open"
      ),
      dialog.trigger(h.button.attr("id", "other")).children("Other"),
      dialog.portal(
        h.dialog.attrs({
          id: "mine",
          "aria-describedby": "extra",
          style: "z-index:2"
        })
      )?.children(
        dialog.backdrop(
          h.div.class("backdrop").attrs({ role: "none", "data-closed": "" })
        ),
        dialog.viewport(h.div.class("viewport").attr("data-nested", ""))
          .children(
            dialog.popup(
              h.div.class("popup").attrs({ "data-open": "", tabindex: "0" })
            ).children(
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
const tracked = (scene: Rendered): TrackDialog =>
  (scene.get(portal) as unknown as View.Element<unknown>).owned?.find((layer) =>
    layer.mount !== undefined
  )
    ?.mount as unknown as TrackDialog
// A message the mount sends, as its Stream would.
const sent = (tag: string, fields: object = {}) =>
  ({ _tag: tag, ...fields }) as never

// The plain values the parts carry now.
const partsOf = (
  scene: { readonly parts: (f: (dialog: Parts) => void) => unknown }
): Parts => {
  let parts: Parts | undefined
  scene.parts((dialog) => {
    parts = dialog
  })
  return parts!
}

const dismissed = (reason: string) =>
  ({ _tag: "RequestedClose", reason }) as DialogEvents

describe("Dialog", () => {
  it.effect("remembers the trigger that opened it, and only that one asks to close it", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Dialog, { open: false }, standIn)
      const other = Locator.text("Other", { exact: true })
      assert.isUndefined(scene.query(portal))
      assert.deepInclude(scene.get(trigger).attrs, {
        type: "button",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
        class: "open"
      })
      assert.isUndefined(scene.get(trigger).attrs?.["aria-controls"])
      assert.isUndefined(scene.get(trigger).attrs?.["data-popup-open"])
      assert.isString(scene.get(trigger).attrs?.id)
      assert.strictEqual(scene.get(other).attrs?.id, "other")
      scene.click(trigger).emitted({ _tag: "RequestedOpen", triggerId: null })
      assert.isNull(partsOf(scene).openMethod)
      scene.props({ open: true })
      scene.expectMount(tracked(scene))
      assert.strictEqual(partsOf(scene).openMethod, "mouse")
      const id = scene.get(portal).attrs?.id
      assert.notStrictEqual(id, "mine")
      assert.deepInclude(scene.get(trigger).attrs, {
        "aria-expanded": "true",
        "aria-controls": id,
        "data-popup-open": ""
      })
      assert.deepInclude(scene.get(other).attrs, { "aria-expanded": "false" })
      scene.click(other).emitted({ _tag: "RequestedOpen", triggerId: "other" })
      assert.deepInclude(scene.get(other).attrs, {
        "aria-expanded": "true",
        "aria-controls": id
      })
      assert.strictEqual(partsOf(scene).triggerId, "other")
      assert.strictEqual(scene.get(trigger).attrs?.["aria-expanded"], "false")
      // Enter or Space on the trigger is a click with no pointer.
      scene.fire(other, "click", { button: 0, x: 0, y: 0, pointerType: "" })
        .emitted(dismissed("trigger-press"))
      assert.strictEqual(partsOf(scene).closeMethod, "keyboard")
      scene.props({
        open: true,
        triggerId: scene.get(trigger).attrs?.id ?? null
      })
      scene.expectMount(tracked(scene))
      assert.strictEqual(scene.get(trigger).attrs?.["aria-expanded"], "true")
      assert.strictEqual(scene.get(other).attrs?.["aria-expanded"], "false")
      scene.props({ open: false })
      assert.isNull(partsOf(scene).openMethod)
    }))

  it.effect("labels the portal with the drawn title and description, and draws a layer for a modal", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(
        Dialog,
        { open: true, openMethod: "touch" },
        standIn
      )
      scene.expectMount(tracked(scene))
      assert.strictEqual(partsOf(scene).openMethod, "touch")
      assert.deepInclude(scene.get(portal).props, {
        open: false,
        popoverOpen: true
      })
      scene.mounted(tracked(scene), sent("ShowedPortal"))
      const dialog = scene.get(portal)
      assert.deepInclude(dialog.props, { open: false, popoverOpen: true })
      assert.strictEqual(dialog.attrs?.popover, "manual")
      assert.isUndefined(dialog.attrs?.["aria-modal"])
      assert.strictEqual(dialog.attrs?.["aria-labelledby"], "heading")
      assert.strictEqual(scene.get(Locator.tag("h2")).attrs?.id, "heading")
      // A token list keeps the consumer's tokens.
      assert.strictEqual(
        dialog.attrs?.["aria-describedby"],
        "extra " + scene.get(Locator.tag("p")).attrs?.id
      )
      assert.match(
        dialog.attrs?.style ?? "",
        /^z-index:2;position:fixed;inset:0;width:0;height:0;/
      )
      const [layer] = (dialog as View.Element<unknown>)
        .children as ReadonlyArray<View.Element<unknown>>
      assert.deepInclude(layer!.attrs, { role: "presentation" })
      assert.isUndefined(layer!.attrs.inert)
      assert.match(
        layer!.attrs.style ?? "",
        /^position:fixed;inset:0;user-select:none/
      )
      assert.deepInclude(scene.get(backdrop).attrs, {
        role: "presentation",
        "data-open": "",
        "data-starting-style": "",
        style: "user-select:none;-webkit-user-select:none"
      })
      assert.isUndefined(scene.get(backdrop).attrs?.["data-closed"])
      assert.isUndefined(scene.get(backdrop).attrs?.["data-ending-style"])
      assert.deepInclude(scene.get(viewport).attrs, { role: "presentation" })
      assert.isUndefined(scene.get(viewport).attrs?.style)
      assert.deepInclude(scene.get(popup).attrs, {
        tabindex: "-1",
        style: "--nested-dialogs:0"
      })
      assert.isUndefined(scene.get(viewport).attrs?.["data-nested"])
      assert.strictEqual(scene.get(close).attrs?.type, "button")
      assert.strictEqual(scene.get(Locator.tag("input")).attrs?.autofocus, "")
      assert.strictEqual(
        scene.get(Locator.text("Next", { exact: true })).attrs
          ?.["data-final-focus"],
        dialog.attrs?.id
      )
    }))

  it.effect("names no title or description that isn't drawn", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Dialog, { open: true }, {
        elements: Html,
        view: (dialog: Parts, h: H) =>
          h.div(
            dialog.portal(h.dialog.attr("aria-labelledby", "outside"))
              ?.children(dialog.popup(h.div.class("popup")))
          )
      })
      scene.expectMount(tracked(scene))
      assert.strictEqual(
        scene.get(portal).attrs?.["aria-labelledby"],
        "outside"
      )
      assert.isUndefined(scene.get(portal).attrs?.["aria-describedby"])
    }))

  it.effect("reports close methods and ignores outside dismissal when disabled", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Dialog, { open: true }, standIn)
      scene.expectMount(tracked(scene))
      scene.mounted(tracked(scene), sent("PressedEscape")).emitted(
        dismissed("escape-key")
      )
      scene.fire(close, "click", {
        button: 0,
        x: 0,
        y: 0,
        pointerType: "touch"
      })
        .emitted(dismissed("close-press"))
      assert.strictEqual(partsOf(scene).closeMethod, "touch")
      scene.mounted(
        tracked(scene),
        sent("PressedOutside", { pointerType: "pen" })
      )
        .emitted(dismissed("outside-press"))
      assert.strictEqual(partsOf(scene).closeMethod, "pen")
      // With pointer dismissal off, neither a press outside nor focus leaving does.
      scene.props({ open: true, modal: false, disablePointerDismissal: true })
      scene.expectMount(tracked(scene))
        .mounted(
          tracked(scene),
          sent("PressedOutside", { pointerType: "mouse" })
        )
        .mounted(tracked(scene), sent("FocusedOutside"))
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  for (const topLayer of [true, false]) {
    it.effect(`opens and closes in HtmlPlay with topLayer: ${topLayer}`, () =>
      Effect.gen(function*() {
        const Msg = UiSchema.TaggedEnum({ Opened: {}, Closed: {} })
        const Settings = Html.component({
          name: "Settings",
          model: Schema.Boolean,
          message: Msg
        }).make({
          init: () => false,
          update: { Opened: () => true, Closed: () => false },
          view: (h, open) =>
            Dialog(h, {
              props: { open, topLayer },
              onEmit: {
                RequestedOpen: () => Msg.Opened(),
                RequestedClose: () => Msg.Closed(),
                Settled: () => undefined
              },
              view: (dialog) =>
                h.div(
                  dialog.trigger(h.button).children("Settings"),
                  dialog.portal(h.dialog)?.children(
                    dialog.popup(h.div).children(
                      dialog.title(h.h2).children("Settings"),
                      dialog.close(h.button).children("Close")
                    )
                  )
                )
            })
        })
        const play = yield* HtmlPlay.make(Settings, {})
        const settings = HtmlLocator.role("button", { name: "Settings" })
        yield* play.click(settings)
        yield* play.expect(HtmlLocator.role("dialog", { name: "Settings" }))
          .toExist()
        yield* play.click(HtmlLocator.role("button", { name: "Close" }))
        yield* play.expect(settings).toHaveAttribute("aria-expanded", "false")
      }).pipe(Effect.provide(TestHost.layer())))
  }

  it.effect("reports transition state and waits for holdExit to be released before settling", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Dialog, { open: true }, standIn)
      scene.expectMount(tracked(scene))
      assert.strictEqual(partsOf(scene).transitionStatus, "starting")
      scene.mounted(tracked(scene), sent("ShowedPortal")).mounted(
        tracked(scene),
        sent("RenderedFirstFrame")
      )
      assert.isNull(partsOf(scene).transitionStatus)
      for (const part of [backdrop, viewport, popup]) {
        assert.strictEqual(scene.get(part).attrs?.["data-open"], "")
        assert.isUndefined(scene.get(part).attrs?.["data-starting-style"])
      }
      scene.expectMount(tracked(scene))
        .mounted(tracked(scene), sent("FinishedTransition", { open: true }))
        .emitted({ _tag: "Settled", open: true })

      scene.props({ open: false, holdExit: true })
      scene.expectMount(tracked(scene))
      assert.strictEqual(scene.get(portal).props?.popoverOpen, true)
      assert.strictEqual(partsOf(scene).transitionStatus, "ending")
      assert.isTrue(partsOf(scene).mounted)
      for (const part of [backdrop, viewport, popup]) {
        assert.deepInclude(scene.get(part).attrs, {
          "data-closed": "",
          "data-ending-style": ""
        })
        assert.isUndefined(scene.get(part).attrs?.["data-open"])
      }
      const [layer] = (scene.get(portal) as View.Element<unknown>)
        .children as ReadonlyArray<View.Element<unknown>>
      assert.strictEqual(layer!.attrs.inert, "")
      assert.match(
        scene.get(backdrop).attrs?.style ?? "",
        /pointer-events:none$/
      )
      assert.strictEqual(
        scene.get(viewport).attrs?.style,
        "pointer-events:none"
      )
      // Its animations ending doesn't end the exit.
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
      assert.deepStrictEqual(scene.current.emitted, [])
      // Let go, the mount waits for them again, and then it ends.
      scene.props({ open: false, holdExit: false })
      scene.expectMount(tracked(scene))
      // An opening animation that finishes late must not settle this exit.
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: true }))
      assert.deepStrictEqual(scene.current.emitted, [])
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted({ _tag: "Settled", open: false })
      assert.isUndefined(scene.query(portal))
    }))

  it.effect("keepMounted leaves a hidden portal with an inert layer", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(
        Dialog,
        { open: false, keepMounted: true },
        standIn
      )
      assert.deepInclude(scene.get(portal).props, {
        open: false,
        popoverOpen: false
      })
      assert.deepInclude(scene.get(popup).attrs, { "data-closed": "" })
      const [layer, child] = (scene.get(portal) as View.Element<unknown>)
        .children as ReadonlyArray<View.Element<unknown>>
      assert.strictEqual(layer!.attrs.inert, "")
      assert.strictEqual(child!.attrs.class, "backdrop")
    }))

  it.effect("the other modes draw no layer, and only a non-modal dialog sets aria-modal, to false", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(
        Dialog,
        { open: true, modal: "trap-focus" },
        standIn
      )
      scene.expectMount(tracked(scene)).mounted(
        tracked(scene),
        sent("ShowedPortal")
      )
      assert.deepInclude(scene.get(portal).attrs, { popover: "manual" })
      assert.isUndefined(scene.get(portal).attrs?.["aria-modal"])
      assert.deepInclude(scene.get(portal).props, {
        open: false,
        popoverOpen: true
      })
      assert.strictEqual(
        ((scene.get(portal) as View.Element<unknown>)
          .children[0] as View.Element<
            unknown
          >).attrs.class,
        "backdrop"
      )
      scene.props({ open: true, modal: false, initialFocus: false })
      assert.isUndefined(scene.get(Locator.tag("input")).attrs?.autofocus)
      scene.expectMount(tracked(scene))
      assert.strictEqual(scene.get(portal).props?.popoverOpen, true)
      assert.strictEqual(scene.get(portal).attrs?.["aria-modal"], "false")
    }))

  it.effect("a nested dialog can force a backdrop, and a parent ignores Escape", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Dialog, { open: true }, standIn)
      scene.expectMount(tracked(scene))
      scene.shared(Dialog, { open: true })
      assert.isTrue(partsOf(scene).nested)
      assert.isUndefined(scene.query(backdrop))
      scene.props({ open: true, nested: false })
      assert.isFalse(partsOf(scene).nested)
      assert.isDefined(scene.query(backdrop))
      scene.props({ open: true, forceRenderBackdrop: true })
      assert.isTrue(partsOf(scene).nested)
      assert.isDefined(scene.query(backdrop))
      // One dialog open inside this one, and one inside that.
      scene.collected([2, 0])
      assert.strictEqual(partsOf(scene).nestedDialogs, 2)
      scene.expectMount(tracked(scene)).mounted(
        tracked(scene),
        sent("PressedEscape")
      )
      assert.deepStrictEqual(scene.current.emitted, [])
    }))
})

// Two dialogs, one in the other's popup, open from the start.
const NestedMessage = UiSchema.TaggedEnum({ RequestedCloseInner: {} })
const Nested = Html.component({
  name: "Nested",
  model: Schema.Struct({ inner: Schema.Boolean }),
  message: NestedMessage
}).make({
  init: () => ({ inner: true }),
  update: {
    RequestedCloseInner: ($) => ({ ...$.model, inner: false })
  },
  view: (h, model) =>
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
                  RequestedOpen: () => undefined,
                  RequestedClose: () => NestedMessage.RequestedCloseInner(),
                  Settled: () => undefined
                },
                view: (innerDialog) =>
                  h.div(
                    innerDialog.trigger(h.button).children("Confirm"),
                    innerDialog.portal(h.dialog)?.children(
                      innerDialog.backdrop(h.div.class("inner-backdrop")),
                      innerDialog.popup(h.div.class("inner")).children(
                        innerDialog.close(h.button).children("Keep")
                      )
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
      assert.deepInclude(outer.attrs, {
        "data-nested-dialog-open": "",
        style: "--nested-dialogs:1"
      })
      assert.isUndefined(outer.attrs?.["data-nested"])
      assert.strictEqual(
        root.get(Locator.attr("class", "inner")).attrs?.["data-nested"],
        ""
      )
      assert.isDefined(root.query(Locator.attr("class", "outer-backdrop")))
      assert.isUndefined(root.query(Locator.attr("class", "inner-backdrop")))
      Locator.fire(root.get(Locator.text("Keep", { exact: true })), "click")
      yield* TestHost.settle
      assert.isUndefined(root.query(Locator.attr("class", "inner")))
      assert.isUndefined(
        root.get(Locator.attr("class", "outer")).attrs
          ?.["data-nested-dialog-open"]
      )
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})

const h = View.makeHelper<string, {}, Html.Elements>({}, Html)

describe("DialogTrigger", () => {
  it("draws a trigger for a dialog drawn elsewhere, and its attributes win", () => {
    const closed = View.build(
      DialogTrigger(h, {
        element: h.button.attrs({
          "aria-expanded": "true",
          "data-popup-open": ""
        }),
        props: { open: false },
        onPress: "open"
      }),
      []
    ) as View.Element<string>
    assert.deepInclude(closed.attrs, {
      "aria-haspopup": "dialog",
      "aria-expanded": "false"
    })
    assert.isUndefined(closed.attrs["data-popup-open"])
    assert.strictEqual(closed.handlers.click, "open")
    assert.isUndefined(closed.attrs["aria-controls"])
    const open = View.build(
      DialogTrigger(h, { props: { open: true } }),
      []
    ) as View.Element<string>
    assert.deepInclude(open.attrs, {
      "aria-expanded": "true",
      "data-popup-open": ""
    })
    assert.isUndefined(open.attrs["aria-controls"])
  })

  it("an anonymous detached keyboard press has no trigger id", () => {
    const anonymous = View.build(
      DialogTrigger(h, {
        props: { open: false },
        onPress: ({ triggerId, method }) => `${triggerId} ${method}`
      }),
      []
    ) as View.Element<string>
    assert.strictEqual(
      (anonymous.handlers.click as (payload: object) => string)({
        pointerType: ""
      }),
      "null keyboard"
    )
  })

  it("rejects a click handler of the caller's own only with onPress", () => {
    const own = h.button.on("click", "mine")
    const clash = /DialogTrigger: the element already handles click/
    for (const open of [false, true]) {
      const props = { open }
      assert.throws(
        () =>
          View.build(
            DialogTrigger(h, { props, element: own, onPress: "open" }),
            []
          ),
        clash
      )
      assert.throws(
        () =>
          View.build(
            DialogTrigger(h, { props, onPress: "open" }).on("click", "mine"),
            []
          ),
        clash
      )
      assert.strictEqual(
        View.build(DialogTrigger(h, { props, element: own }), []).handlers
          .click,
        "mine"
      )
      assert.strictEqual(
        View.build(DialogTrigger(h, { props }).on("click", "mine"), []).handlers
          .click,
        "mine"
      )
    }
  })
})
