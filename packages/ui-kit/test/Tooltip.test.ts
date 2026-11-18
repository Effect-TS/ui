import type { Mount } from "@effect/ui"
import { Component, View } from "@effect/ui"
import { Tooltip, type TooltipProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const standIn = {
  elements: Html,
  view: (
    s: Component.Headless.Parts<typeof Tooltip>,
    h: View.Helper<never, TooltipProps> & View.Tags<Html.Elements, never>
  ) =>
    h.span(
      s.trigger(h.button.attr("aria-label", "Bold")).children("B"),
      s.positioner(h.div).children(s.popup(h.div).children(s.arrow(h.div), "Bold"))
    )
}

// Stand-in for the one-element Button port until it lands.
const Button = <Msg, R>(
  h: View.Tags<Html.Elements, Msg>,
  options: {
    readonly element?: Html.Element<Msg, R, Html.EventsOf<"button">, HTMLButtonElement, "button">
    readonly props?: { readonly disabled?: boolean }
    readonly onPress?: Msg
  }
) => {
  const element = (options.element ?? h.button).attr("type", "button").disabled(options.props?.disabled === true)
  return options.onPress === undefined ? element : element.onClick(options.onPress)
}

// A parent that opens the tooltip on a styled Button and counts what it hears.
const ToolbarMessage = Schema.TaggedUnion({ PressedBold: {}, OpenedBoldTip: {}, DismissedBoldTip: {} })

const Toolbar = Component.define({
  name: "Toolbar",
  model: Schema.Struct({ open: Schema.Boolean, pressed: Schema.Number, dismissed: Schema.Number }),
  message: ToolbarMessage,
  elements: Html
}).make({
  init: () => ({ open: true, pressed: 0, dismissed: 0 }),
  update: (model, message) =>
    ToolbarMessage.match(message, {
      PressedBold: () => ({ ...model, pressed: model.pressed + 1 }),
      OpenedBoldTip: () => ({ ...model, open: true }),
      DismissedBoldTip: () => ({ ...model, open: false, dismissed: model.dismissed + 1 })
    }),
  view: (model, h) =>
    h.div(
      Tooltip(h, {
        key: "bold",
        props: { open: model.open },
        onEmit: (event) =>
          ToolbarMessage.make({ _tag: event._tag === "Opened" ? "OpenedBoldTip" : "DismissedBoldTip" }),
        view: (t) =>
          h.span(
            Button(h, {
              element: t.trigger(h.button),
              onPress: ToolbarMessage.make({ _tag: "PressedBold" })
            }).class("tool").attr("aria-label", "Bold").children("B"),
            t.positioner(h.div).children("Bold")
          )
      }),
      h.output(`pressed ${model.pressed}, dismissed ${model.dismissed}`)
    )
})

const trigger = Locator.tag("button")
const positioner = Locator.attr("role", "presentation")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

// The positioner's document listener is private, so a test reads it off the
// rendered element. It's there only while the tooltip shows.
type TrackDismissal = Mount.Issued<unknown, never, never, "PressedEscape" | "PressedDocument">
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const listener = (s: Rendered): TrackDismissal | undefined =>
  (s.get(positioner) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as TrackDismissal | undefined
const trackDismissal = (s: Rendered): TrackDismissal => listener(s)!

// The message a wait would have produced: the Command's own result.
const completed = (tag: "CompletedWaitBeforeOpening" | "CompletedWaitBeforeClosing") => ({ _tag: tag }) as never

describe("Tooltip", () => {
  it.effect("hover opens after the delay and stays open across the offset until the pointer leaves", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Tooltip, { open: false }, standIn)
      s.fire(trigger, "mouseenter")
      const [opening] = s.current.pending
      assert.deepStrictEqual(opening?.command.args, { delay: 600 })
      s.resolve(opening!.command, completed("CompletedWaitBeforeOpening"))
        .emitted({ _tag: "Opened" })
      assert.isFalse(s.get(positioner).props?.popoverOpen)
      s.props({ open: true, side: "bottom", sideOffset: 8 })
      s.expectMount(trackDismissal(s))

      assert.isTrue(s.get(positioner).props?.popoverOpen)
      // Each part draws the children it was given.
      assert.strictEqual(Locator.textOf(s.get(positioner)), "Bold")
      assert.include(s.get(positioner).attrs?.style, "padding-top:8px")

      s.fire(trigger, "mouseleave")
      // The gap is the positioner's padding, so the pointer reaches it as it
      // leaves the trigger, before the wait ends, and the tooltip stays open.
      s.fire(positioner, "mouseenter")
      assert.deepStrictEqual(s.current.interrupted.map((c) => c.name), ["WaitBeforeClosing"])
      s.fire(positioner, "mouseleave")
      s.resolve(s.current.pending[0]!.command, completed("CompletedWaitBeforeClosing"))
        .emitted({ _tag: "Dismissed" })
    }))

  it.effect("document Escape dismisses without trigger focus", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Tooltip, { open: true }, standIn)
      s.mounted(trackDismissal(s), "PressedEscape").emitted({ _tag: "Dismissed" })
    }))

  it.effect("focus from a press neither opens the tooltip nor holds it open", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Tooltip, { open: false }, standIn)
      s.fire(trigger, "mousedown")
        .fire(trigger, "focus")
      assert.deepStrictEqual(s.current.emitted, [])
      s.props({ open: true })
      s.expectMount(trackDismissal(s))
        .fire(trigger, "mouseleave")
      s.resolve(s.current.pending[0]!.command, completed("CompletedWaitBeforeClosing"))
        .emitted({ _tag: "Dismissed" })
    }))

  it.effect("activation dismisses on click rather than mousedown unless closeOnClick is false", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Tooltip, { open: true }, standIn)
      s.expectMount(trackDismissal(s)).fire(trigger, "click")
        .emitted({ _tag: "Dismissed" })
      s.fire(trigger, "mousedown")
      assert.deepStrictEqual(s.current.emitted, [])
      s.props({ open: true, closeOnClick: false })
        .fire(trigger, "click")
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it.effect("a press outside closes the tooltip at once, while focus or the close delay holds it open", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Tooltip, { open: false, closeDelay: 300 }, standIn)
      s.fire(trigger, "focus")
        .emitted({ _tag: "Opened" })
        .props({ open: true, closeDelay: 300 })
      // A press with the pointer on the trigger or the positioner is inside.
      s.expectMount(trackDismissal(s)).fire(positioner, "mouseenter")
        .mounted(trackDismissal(s), "PressedDocument")
      assert.deepStrictEqual(s.current.emitted, [])
      // Keyboard focus holds the tooltip open after the pointer leaves, and
      // a press elsewhere that leaves focus on the trigger still closes it.
      s.fire(positioner, "mouseleave")
      assert.deepStrictEqual(s.current.pending, [])
      s.mounted(trackDismissal(s), "PressedDocument")
        .emitted({ _tag: "Dismissed" })

      // Without focus, the close delay holds it open, and a press ends the wait.
      s.fire(trigger, "mouseenter")
        .fire(trigger, "blur")
        .fire(trigger, "mouseleave")
      assert.deepStrictEqual(s.current.pending.map((run) => run.command.args), [{ delay: 300 }])
      s.mounted(trackDismissal(s), "PressedDocument")
        .emitted({ _tag: "Dismissed" })
      assert.deepStrictEqual(s.current.pending, [])
    }))

  it.effect("a disabled tooltip never shows and emits nothing", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Tooltip, { open: true, disabled: true }, standIn)
      assert.isFalse(s.get(positioner).props?.popoverOpen)
      assert.isUndefined(s.get(trigger).attrs?.disabled)
      s.fire(trigger, "mouseenter")
        .fire(trigger, "focus")
        .fire(trigger, "mousedown")
        .fire(trigger, "click")
      // It doesn't listen on the document either.
      assert.isUndefined(listener(s))
      assert.deepStrictEqual(s.current.pending, [])
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it("parts clear stale state and preserve consumer styles alongside their shared anchor", () => {
    const s = Story.parts(Tooltip, {
      model: { hovered: false, focused: false, pressed: false, instant: null },
      props: { open: false }
    })
    // The anchor survives a style the consumer chains after the part.
    const trigger = View.build(s.trigger(h.button.attr("data-popup-open", "")).style({ color: "red" }), [])
    assert.isUndefined(trigger.attrs["data-popup-open"])
    const anchor = /^color:red;anchor-name:(--[\w-]+)$/.exec(trigger.attrs.style ?? "")?.[1]
    assert.isDefined(anchor)
    const positioner = View.build(s.positioner(h.div.style({ zIndex: "10" })), [])
    assert.include(positioner.attrs.style, `z-index:10;position-anchor:${anchor};`)
  })

  it.effect("one click on a trigger stacked under a styled Button reaches both the Button and the tooltip", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Toolbar, {})
      const button = root.get(trigger)
      assert.strictEqual(button.attrs?.class, "tool")
      assert.strictEqual(button.attrs?.type, "button")
      assert.match(button.attrs?.style ?? "", /^anchor-name:--/)
      assert.strictEqual(button.attrs?.["data-popup-open"], "")

      Locator.fire(button, "click")
      yield* TestHost.settle
      // The parent got Button's press and the tooltip's dismissal, once each.
      assert.strictEqual(Locator.textOf(root.get(Locator.tag("output"))), "pressed 1, dismissed 1")
      assert.isUndefined(root.get(trigger).attrs?.["data-popup-open"])
    }).pipe(Effect.provide(TestHost.layer())))
})
