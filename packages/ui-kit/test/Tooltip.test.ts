import type { Mount } from "@effect/ui"
import { Component, View } from "@effect/ui"
import { Tooltip, type TooltipProps, TooltipProvider } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { TestClock } from "effect/testing"

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

// Two tooltips under a provider, and one Model field for which one shows.
const Tip = Schema.Literals(["bold", "italic"])
const GroupedMessage = Schema.TaggedUnion({ OpenedTip: { tip: Tip }, DismissedTip: { tip: Tip } })

const Grouped = Component.define({
  name: "Grouped",
  model: Schema.Struct({ tip: Schema.NullOr(Tip) }),
  message: GroupedMessage,
  elements: Html
}).make({
  init: () => ({ tip: null }),
  update: (model, message) =>
    GroupedMessage.match(message, {
      OpenedTip: ({ tip }) => ({ tip }),
      DismissedTip: ({ tip }) => (model.tip === tip ? { tip: null } : model)
    }),
  view: (model, h) =>
    TooltipProvider(h, {
      props: {},
      view: () =>
        h.div(
          ...Tip.literals.map((tip) =>
            Tooltip(h, {
              key: tip,
              props: { open: model.tip === tip },
              onEmit: (event) =>
                GroupedMessage.make({ _tag: event._tag === "Opened" ? "OpenedTip" : "DismissedTip", tip }),
              view: (s) =>
                h.span(
                  s.trigger(h.button.attr("aria-label", tip)).children(tip),
                  s.positioner(h.div).children(s.popup(h.div.class(`${tip}-popup`)).children(tip))
                )
            })
          )
        )
    })
})

// Two tooltips under a provider, each with its own field. `keep` refuses
// bold's `Dismissed`, and `bold` counts bold's requests to close.
const IndependentMessage = Schema.TaggedUnion({ OpenedTip: { tip: Tip }, DismissedTip: { tip: Tip } })

const Independent = Component.define({
  name: "Independent",
  props: Schema.Struct({ keep: Schema.Boolean, closeDelay: Schema.Number }),
  model: Schema.Struct({ bold: Schema.Boolean, italic: Schema.Boolean, requests: Schema.Number }),
  message: IndependentMessage,
  elements: Html
}).make({
  init: () => ({ bold: false, italic: false, requests: 0 }),
  update: (model, message, $) =>
    IndependentMessage.match(message, {
      OpenedTip: ({ tip }) => ({ ...model, [tip]: true }),
      DismissedTip: ({ tip }) =>
        tip === "bold"
          ? { ...model, bold: $.props.keep, requests: model.requests + 1 }
          : { ...model, italic: false }
    }),
  view: (model, h) =>
    h.div(
      TooltipProvider(h, {
        props: {},
        view: () =>
          h.div(
            ...Tip.literals.map((tip) =>
              Tooltip(h, {
                key: tip,
                props: { open: model[tip], closeDelay: tip === "bold" ? h.props.closeDelay : 0 },
                onEmit: (event) =>
                  IndependentMessage.make({ _tag: event._tag === "Opened" ? "OpenedTip" : "DismissedTip", tip }),
                view: (s) =>
                  h.span(
                    s.trigger(h.button.attr("aria-label", tip)).children(tip),
                    s.positioner(h.div).children(s.popup(h.div).children(tip))
                  )
              })
            )
          )
      }),
      h.output(String(model.requests))
    )
})

// Three tooltips under a provider whose opens and closes the test accepts by
// hand, with `AcceptedOpen` and `AcceptedClose`, whenever it likes. Bold's
// requests to close are counted and refused, so it stays visible. The
// others' are accepted.
const Mark = Schema.Literals(["bold", "italic", "underline"])
const DeferredMessage = Schema.TaggedUnion({
  RequestedOpen: { tip: Mark },
  RequestedClose: { tip: Mark },
  AcceptedOpen: { tip: Mark },
  AcceptedClose: { tip: Mark }
})

const Deferred = Component.define({
  name: "Deferred",
  model: Schema.Struct({
    bold: Schema.Boolean,
    italic: Schema.Boolean,
    underline: Schema.Boolean,
    requests: Schema.Number
  }),
  message: DeferredMessage,
  elements: Html
}).make({
  init: () => ({ bold: false, italic: false, underline: false, requests: 0 }),
  update: (model, message) =>
    DeferredMessage.match(message, {
      RequestedOpen: () => model,
      RequestedClose: (
        { tip }
      ) => (tip === "bold" ? { ...model, requests: model.requests + 1 } : { ...model, [tip]: false }),
      AcceptedOpen: ({ tip }) => ({ ...model, [tip]: true }),
      AcceptedClose: ({ tip }) => ({ ...model, [tip]: false })
    }),
  view: (model, h) =>
    h.div(
      TooltipProvider(h, {
        props: {},
        view: () =>
          h.div(
            ...Mark.literals.map((tip) =>
              Tooltip(h, {
                key: tip,
                props: { open: model[tip] },
                onEmit: (event) =>
                  DeferredMessage.make({ _tag: event._tag === "Opened" ? "RequestedOpen" : "RequestedClose", tip }),
                view: (s) =>
                  h.span(
                    s.trigger(h.button.attr("aria-label", tip)).children(tip),
                    s.positioner(h.div).children(s.popup(h.div).children(tip))
                  )
              })
            )
          )
      }),
      h.output(String(model.requests))
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
      model: { hovered: false, focused: false, pressed: false, instant: null, turn: 0, yieldedTo: null },
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

  it.effect("after one tooltip of a group closes, another opens at once inside the timeout and waits outside it", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Grouped, {})
      const hover = (tip: string) => Locator.fire(root.get(Locator.attr("aria-label", tip)), "mouseenter")
      const leave = (tip: string) => Locator.fire(root.get(Locator.attr("aria-label", tip)), "mouseleave")
      const instant = (tip: string) => root.get(Locator.attr("class", `${tip}-popup`)).attrs?.["data-instant"]
      const open = () => root.query(Locator.attr("data-popup-open", ""))
      const openTip = () => Locator.textOf(open()!)
      const settle = TestHost.settle
      // Commands start when the host settles, so settle before moving the clock.
      const wait = (millis: number) =>
        settle.pipe(Effect.andThen(TestClock.adjust(`${millis} millis`)), Effect.andThen(settle))

      // A opens after its hover delay, then the consumer accepts its close.
      hover("bold")
      yield* wait(600)
      assert.strictEqual(openTip(), "bold")
      leave("bold")
      yield* wait(0)
      assert.isUndefined(open())

      // Inside the window, B opens on the hover itself, marked `delay`.
      yield* wait(399)
      hover("italic")
      yield* settle
      assert.strictEqual(openTip(), "italic")
      assert.strictEqual(instant("italic"), "delay")

      // Outside the window, B waits its full delay again.
      leave("italic")
      yield* wait(400)
      hover("italic")
      yield* wait(599)
      assert.isUndefined(open())
      yield* wait(1)
      assert.strictEqual(openTip(), "italic")
      assert.isUndefined(instant("italic"))
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("when another tooltip of the group is shown, one held open asks once to close, and stays if refused", () =>
    Effect.gen(function*() {
      const wait = (millis: number) =>
        TestHost.settle.pipe(Effect.andThen(TestClock.adjust(`${millis} millis`)), Effect.andThen(TestHost.settle))
      const scene = (root: { readonly get: (locator: Locator.Locator) => TestHost.TestNode }) => ({
        fire: (tip: string, event: string) => Locator.fire(root.get(Locator.attr("aria-label", tip)), event),
        shows: (tip: string) => root.get(Locator.attr("aria-label", tip)).attrs?.["data-popup-open"] === "",
        requests: () => Locator.textOf(root.get(Locator.tag("output")))
      })

      // Keyboard focus holds bold open, and the consumer refuses its close.
      const held = scene(yield* TestHost.mount(Independent, { keep: true, closeDelay: 0 }))
      held.fire("bold", "focus")
      yield* wait(0)
      held.fire("italic", "mouseenter")
      yield* wait(0)
      assert.isTrue(held.shows("italic"))
      assert.strictEqual(held.requests(), "1")
      assert.isTrue(held.shows("bold"))
      // No repeated request while both stay open.
      yield* wait(1000)
      assert.strictEqual(held.requests(), "1")
      assert.isTrue(held.shows("bold"))

      // A close delay holds bold open, and the consumer accepts at once.
      const delayed = scene(yield* TestHost.mount(Independent, { keep: false, closeDelay: 1000 }))
      delayed.fire("bold", "mouseenter")
      yield* wait(600)
      delayed.fire("bold", "mouseleave")
      delayed.fire("italic", "mouseenter")
      yield* wait(0)
      assert.isTrue(delayed.shows("italic"))
      assert.strictEqual(delayed.requests(), "1")
      assert.isFalse(delayed.shows("bold"))
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("both opens requested before either is accepted: the one accepted later still replaces the other", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Deferred, {})
      const wait = (millis: number) =>
        TestHost.settle.pipe(Effect.andThen(TestClock.adjust(`${millis} millis`)), Effect.andThen(TestHost.settle))
      const fire = (tip: string, event: string) => Locator.fire(root.get(Locator.attr("aria-label", tip)), event)
      const requests = () => Locator.textOf(root.get(Locator.tag("output")))
      const shows = (tip: string) => root.get(Locator.attr("aria-label", tip)).attrs?.["data-popup-open"] === ""

      fire("bold", "focus")
      fire("italic", "mouseenter")
      yield* wait(600)
      root.send(DeferredMessage.make({ _tag: "AcceptedOpen", tip: "bold" }))
      yield* wait(0)
      assert.strictEqual(requests(), "0")
      root.send(DeferredMessage.make({ _tag: "AcceptedOpen", tip: "italic" }))
      yield* wait(0)
      assert.isTrue(shows("italic"))
      assert.strictEqual(requests(), "1")
      // Refused: bold stays, and isn't asked again.
      yield* wait(1000)
      assert.isTrue(shows("bold"))
      assert.strictEqual(requests(), "1")
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("tooltips the consumer opens through props, with no request, replace each other too", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Deferred, {})
      const wait = (millis: number) =>
        TestHost.settle.pipe(Effect.andThen(TestClock.adjust(`${millis} millis`)), Effect.andThen(TestHost.settle))
      const accept = (tip: typeof Mark.Type, open: boolean) =>
        root.send(DeferredMessage.make({ _tag: open ? "AcceptedOpen" : "AcceptedClose", tip }))
      const requests = () => Locator.textOf(root.get(Locator.tag("output")))
      const shows = (tip: string) => root.get(Locator.attr("aria-label", tip)).attrs?.["data-popup-open"] === ""

      accept("bold", true)
      yield* wait(0)
      accept("italic", true)
      yield* wait(0)
      assert.strictEqual(requests(), "1")
      yield* wait(1000)
      assert.isTrue(shows("bold"))
      assert.strictEqual(requests(), "1")

      // Underline shown: bold asks again, once, for the new tooltip, and
      // italic closes.
      accept("underline", true)
      yield* wait(0)
      assert.strictEqual(requests(), "2")
      assert.isFalse(shows("italic"))

      // Bold closed and shown again is the newest, so underline gives way.
      accept("bold", false)
      yield* wait(0)
      accept("bold", true)
      yield* wait(0)
      assert.isTrue(shows("bold"))
      assert.isFalse(shows("underline"))
      assert.strictEqual(requests(), "2")
    }).pipe(Effect.provide(TestHost.layer())))
})
