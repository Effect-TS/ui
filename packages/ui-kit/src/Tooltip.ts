/**
 * A popup that shows a short visual label for an element while it's hovered
 * or focused.
 *
 * `Tooltip` is headless: it owns the hover and focus timing, the data
 * attributes and the popup's place in the top layer, and the consumer draws
 * the markup. The consumer owns whether the tooltip is open, passes it as
 * `open`, and stores what the `Opened` and `Dismissed` events report.
 *
 * The tooltip asks to close when the pointer leaves, focus moves away, the
 * trigger is activated, Escape is pressed, or the mouse is pressed outside
 * the trigger and the positioner. The last two close it whatever keeps it
 * open: keyboard focus, `closeDelay`, or a consumer that opened it itself.
 *
 * A tooltip is a visual label for sighted mouse and keyboard users. Screen
 * readers and touch users don't get it, so the trigger still needs its own
 * accessible name, such as an `aria-label` that matches the tooltip's text.
 *
 * **Anatomy**
 *
 * | Part         | Element                                        |
 * | :----------- | :--------------------------------------------- |
 * | `trigger`    | `<button>` the tooltip describes               |
 * | `positioner` | `<div>`, a manual popover placed by the tooltip  |
 * | `popup`      | `<div>` inside the positioner                  |
 * | `arrow`      | `<div>` inside the popup                       |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children:
 * `tooltip.positioner(h.div).children(tooltip.popup(h.div).children("Bold"))`.
 * A part's result is a builder, so it can also be another kit call's
 * `element`. That puts a tooltip on a ui-kit Button:
 * `Button(h, { element: tooltip.trigger(h.button) }).class("tool").children("B")`.
 *
 * The positioner is a manual popover, so it renders in the top layer and
 * needs no portal. While it shows, the tooltip measures the trigger and
 * writes the positioner's `left` and `top`, again when the page scrolls,
 * the window resizes, or the trigger or the positioner changes size or
 * moves. It needs no CSS anchor positioning. `sideOffset` is padding on the
 * positioner's side facing the trigger, so the gap is part of the positioner
 * and the pointer can cross it to the popup without leaving the tooltip.
 * The positioner's `position`, `inset` and `margin` come after the
 * consumer's own inline style. The browser gives a popover a border,
 * padding, a background and `overflow: auto`, so reset those on the
 * positioner and style the popup instead.
 *
 * **CSS variables**
 *
 * Set on the positioner:
 *
 * - `--anchor-width`, `--anchor-height`: the trigger's size
 * - `--available-width`, `--available-height`: the space between the
 *   trigger and the edge of the collision boundary, for a `max-height`
 * - `--transform-origin`: the point on the trigger the popup grows from
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except `data-side`,
 * `data-align` and `data-instant`, which hold a value:
 *
 * - `trigger`: `data-popup-open`, `data-trigger-disabled`
 * - `positioner`: `data-open` / `data-closed`, `data-side`, `data-align`,
 *   `data-anchor-hidden`
 * - `popup`: `data-open` / `data-closed`, `data-side`, `data-align`,
 *   `data-instant`
 * - `arrow`: `data-open` / `data-closed`, `data-side`, `data-align`,
 *   `data-instant`, `data-uncentered`
 *
 * `data-instant` is `focus` when focus opened the tooltip, `dismiss` when
 * a click on the trigger or Escape closed it, and `delay` when a
 * `TooltipProvider` let it open without its hover delay or another tooltip
 * of the group replaced it, so a transition can be skipped.
 *
 * `data-side` and `data-align` report where the popup is, which can differ
 * from the props after a flip. `data-anchor-hidden` is present while the
 * trigger is scrolled out of view, and `data-uncentered` while the arrow
 * can't point at the trigger's middle without leaving the popup.
 *
 * **Keyboard**
 *
 * Focusing the trigger with the keyboard opens the tooltip without a delay,
 * and moving focus away closes it. Escape closes an open tooltip wherever
 * focus is, so a tooltip opened by hovering can be dismissed without moving
 * the pointer. Activating the trigger with Enter or Space closes it, as a
 * click does. Focus that follows a mouse press on the trigger doesn't open
 * it, and doesn't keep it open after the pointer leaves.
 *
 * **Placement and timing**
 *
 * When the popup doesn't fit, it flips to the opposite side and shifts along
 * the edge, keeping `collisionPadding` from the viewport. The tooltip
 * places the arrow too: it gets `position: absolute` and a `left` or `top`
 * that points it at the trigger, so give it only its size and the offset
 * across the edge in your CSS. To animate the popover, use
 * `@starting-style` and `transition-behavior: allow-discrete`. The
 * `Positioning` module does the placing, and a popup of your own can use it.
 *
 * Each tooltip has one trigger. On its own it waits its own `delay` on
 * every hover. Below a `TooltipProvider`, once one tooltip of the group
 * has been open, hovering another opens it at once, until `timeout` after
 * the last one closed. One tooltip of the group shows at a time: when another is
 * shown, the previous one asks to close. Wrap the group, with nothing to add to each
 * tooltip: `TooltipProvider(h, { props: {}, view: () => h.div(Tooltip(h, ...), Tooltip(h, ...)) })`.
 *
 * Set `closeDelay` to give the pointer time to reach the popup when its
 * path takes it outside both the trigger and the positioner.
 *
 * **Example** (A toolbar button with a tooltip whose open state lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Tooltip } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const ToolbarMessage = UiSchema.TaggedEnum({ OpenedBoldTip: {}, DismissedBoldTip: {} })
 *
 * const Toolbar = Component.define({
 *   name: "Toolbar",
 *   scoped: false,
 *   model: Schema.Struct({ boldTip: Schema.Boolean }),
 *   message: ToolbarMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ boldTip: false }),
 *   update: {
 *     OpenedBoldTip: (model) => ({ ...model, boldTip: true }),
 *     DismissedBoldTip: (model) => ({ ...model, boldTip: false })
 *   },
 *   view: (model, h) =>
 *     Tooltip(h, {
 *       key: "bold",
 *       props: { open: model.boldTip, sideOffset: 8 },
 *       onEmit: {
 *         Opened: () => ToolbarMessage.OpenedBoldTip(),
 *         Dismissed: () => ToolbarMessage.DismissedBoldTip()
 *       },
 *       view: (tooltip) =>
 *         h.span(
 *           tooltip.trigger(h.button.class("tool").attr("aria-label", "Bold")).children("B"),
 *           tooltip.positioner(h.div.class("tip-positioner")).children(
 *             tooltip.popup(h.div.class("tip")).children(tooltip.arrow(h.div.class("tip-arrow")), "Bold")
 *           )
 *         )
 *     })
 * })
 *
 * // The positioner is a manual popover.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Toolbar, {}))
 * if (!/<div class="tip-positioner"[^>]* popover="manual"/.test(html)) throw new Error("the positioner isn't a popover")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { flag, withStyle } from "./internal/attributes.ts"
import * as Positioning from "./Positioning.ts"

/**
 * The side of the trigger a tooltip shows on.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const TooltipSide = Positioning.Side

/**
 * The side of the trigger a tooltip shows on.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type TooltipSide = typeof TooltipSide.Type

/**
 * How a tooltip lines up with its trigger along the side it shows on.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const TooltipAlign = Positioning.Align

/**
 * How a tooltip lines up with its trigger along the side it shows on.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type TooltipAlign = typeof TooltipAlign.Type

/**
 * Controls whether the tooltip is open, how its trigger responds to input,
 * and where the popup appears.
 *
 * **Details**
 *
 * - `open`: whether the tooltip shows. Required: the consumer owns it.
 * - `disabled`: the tooltip never shows and emits nothing. The trigger
 *   stays enabled: disable the button itself if it should be.
 * - `delay`: milliseconds the pointer rests on the trigger before the
 *   tooltip opens, 600 by default.
 * - `closeDelay`: milliseconds after the pointer leaves the trigger or the
 *   positioner before the tooltip closes, 0 by default.
 * - `closeOnClick`: whether activating the trigger, by a click, Enter or
 *   Space, closes the tooltip, true by default.
 * - `disableHoverablePopup`: the pointer on the popup doesn't keep the
 *   tooltip open, and the positioner takes no pointer events.
 * - `side`: the side of the trigger the popup shows on, `"top"` by default.
 *   `"inline-start"` and `"inline-end"` follow the writing direction.
 * - `align`: how the popup lines up with the trigger along that side,
 *   `"center"` by default.
 * - `sideOffset`: the gap between the trigger and the popup, in pixels.
 * - `alignOffset`: pixels the popup moves along the side, toward the
 *   trigger's other end when aligned to the start or the end, and right or
 *   down when centred.
 * - `collisionAvoidance`: what happens when the popup doesn't fit: `side`
 *   and `align` each `"flip"`, `"shift"` or `"none"`, both `"flip"` by
 *   default, and `fallbackAxisSide`, the side on the other axis to try when
 *   neither side fits, `"end"` by default.
 * - `collisionBoundary`: the area the popup keeps inside, the viewport by
 *   default, an element's `{ id }`, or a rectangle in viewport coordinates.
 * - `collisionPadding`: pixels kept from the boundary's edges, 5 by
 *   default, as one number or per side.
 * - `sticky`: the popup stays in view when the trigger scrolls out of it.
 * - `arrowPadding`: pixels kept between the arrow and the popup's corners,
 *   5 by default.
 * - `positionMethod`: `"absolute"`, the default, or `"fixed"`, which
 *   doesn't make the page taller when the popup reaches past its end.
 * - `disableAnchorTracking`: the popup is placed only when it opens, when
 *   the window resizes and when its own size changes, not when the page
 *   scrolls or the trigger moves or changes size.
 * - `anchor`: the id of an element to place the popup against instead of
 *   the trigger.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const TooltipProps = Schema.Struct({
  open: Schema.Boolean,
  disabled: Schema.optional(Schema.Boolean),
  delay: Schema.optional(Schema.Number),
  closeDelay: Schema.optional(Schema.Number),
  closeOnClick: Schema.optional(Schema.Boolean),
  disableHoverablePopup: Schema.optional(Schema.Boolean),
  ...Positioning.PositionerFields
})

/**
 * The props of a `Tooltip`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type TooltipProps = typeof TooltipProps.Type

/**
 * `Opened` requests that the tooltip open after the hover delay or when the
 * trigger receives keyboard focus. `Dismissed` requests that it close when
 * the pointer leaves, focus moves away, or the user activates the trigger,
 * presses Escape or presses outside the tooltip. The consumer decides
 * whether to update `open` in response.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const TooltipEvents = UiSchema.TaggedEnum({
  Opened: {},
  Dismissed: {}
})

/**
 * What a `Tooltip` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type TooltipEvents = typeof TooltipEvents.Type

// Pointer, focus and key facts from the trigger, the positioner and the
// document, and the ends of the two timers.
const Message = UiSchema.TaggedEnum({
  EnteredTrigger: {},
  LeftTrigger: {},
  FocusedTrigger: {},
  BlurredTrigger: {},
  PressedTrigger: {},
  ClickedTrigger: {},
  EnteredPositioner: {},
  LeftPositioner: {},
  PressedEscape: {},
  PressedDocument: {},
  CompletedWaitBeforeOpening: {},
  CompletedWaitBeforeClosing: {},
  // The provider's shared value changed: the newest turn that shows, and the
  // turn a newly shown tooltip takes.
  ChangedGroup: { newest: Schema.NullOr(Schema.Number), next: Schema.Number },
  ChangedPlacement: { placement: Positioning.Placement }
})

// Only the pointer and focus, which the consumer would never store.
// `hovered`: the pointer is on the trigger or the positioner. `focused`: the
// keyboard focused the trigger. `pressed` marks a mouse press on the
// trigger, so the focus that follows it neither opens the tooltip nor holds
// it open. `instant` is why the last change skips its transition, as
// `data-instant` reports it: `delay` when a TooltipProvider let it skip the
// hover delay. `turn` orders the shown tooltips of a provider's group: the
// one it took when it was last shown, 0 while it hasn't taken one or isn't
// shown. `yieldedTo` is the turn it last asked to close for, so a refused
// request isn't repeated.
const Model = Schema.Struct({
  hovered: Schema.Boolean,
  focused: Schema.Boolean,
  pressed: Schema.Boolean,
  instant: Schema.NullOr(Schema.Literals(["focus", "dismiss", "delay"])),
  turn: Schema.Number,
  yieldedTo: Schema.NullOr(Schema.Number),
  placement: Schema.NullOr(Positioning.Placement)
})

// `switch`: a new wait replaces the running one, and leaving or entering
// interrupts it, so a cut wait sends nothing.
const WaitBeforeOpening = Command.make(
  "WaitBeforeOpening",
  { args: { delay: Schema.Number }, mode: "switch" },
  ({ delay }) => Effect.as(Effect.sleep(Duration.millis(delay)), Message.CompletedWaitBeforeOpening())
)

const WaitBeforeClosing = Command.make(
  "WaitBeforeClosing",
  { args: { delay: Schema.Number }, mode: "switch" },
  ({ delay }) => Effect.as(Effect.sleep(Duration.millis(delay)), Message.CompletedWaitBeforeClosing())
)

// The two dismissals no part hears, listened for on the document while the
// tooltip shows. Escape anywhere, so a tooltip opened by hovering can be
// dismissed without moving focus or the pointer: its default is cancelled,
// so an enclosing dialog stays open, and an Escape something else already
// handled is skipped. And a mouse press anywhere, in the capture phase so a
// handler that stops the event can't hide it: `update` knows from `hovered`
// whether the press was outside the tooltip.
const dismissals = [
  Html.onDocument(
    "keydown",
    ({ composing, defaultPrevented, key }) =>
      key === "Escape" && !composing && !defaultPrevented ? Message.PressedEscape() : undefined,
    { preventDefault: true }
  ),
  Html.onDocument("mousedown", Message.PressedDocument(), { capture: true })
]

const opened = TooltipEvents.Opened()
const dismissed = TooltipEvents.Dismissed()

// The newest turn that shows in a provider's group: the highest, as turns
// are taken in order. 0 is a tooltip that hasn't taken one yet.
const newestOf = (turns: ReadonlyArray<number>): number | null => {
  const taken = turns.filter((turn) => turn > 0)
  return taken.length === 0 ? null : Math.max(...taken)
}

// A disabled tooltip never shows, whatever `open` says.
const shownBy = (props: TooltipProps): boolean => props.open && props.disabled !== true

// `$` in any handler of the Tooltip's `update`: a tag's `$` fits the one
// over the whole message type.
type TooltipUpdate = Component.Update<typeof Model.Type, typeof Message.Type, TooltipEvents, TooltipProps>

// The user closed the tooltip, if it shows. Any wait for `closeDelay` is over.
const dismiss = (model: typeof Model.Type, $: TooltipUpdate, instant = model.instant) =>
  shownBy($.props)
    ? $.set({ ...model, instant }).run(Command.interrupt(WaitBeforeClosing)).emit(dismissed)
    : model

// The pointer left the trigger or the positioner: a pending open stops, and
// an open tooltip closes after `closeDelay` unless keyboard focus holds it.
const left = (model: typeof Model.Type, _message: unknown, $: TooltipUpdate) => {
  const next = { ...model, hovered: false, pressed: false }
  if (!shownBy($.props)) return $.set(next).run(Command.interrupt(WaitBeforeOpening))
  if (model.focused) return next
  return $.set(next).run(WaitBeforeClosing({ delay: $.props.closeDelay ?? 0 }))
}

/**
 * The props of a `TooltipProvider`.
 *
 * **Details**
 *
 * - `timeout`: milliseconds after the last tooltip in the group closes
 *   during which hovering another opens it at once, 400 by default.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const TooltipProviderProps = Schema.Struct({
  timeout: Schema.optional(Schema.Number)
})

/**
 * The props of a `TooltipProvider`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type TooltipProviderProps = typeof TooltipProviderProps.Type

// The turns of the tooltips below that show, from their reports, sorted so
// the message doesn't depend on their order, with 0 for one that hasn't
// taken a turn yet. And the end of the window after the last one closed.
const ProviderMessage = UiSchema.TaggedEnum({
  ChangedShown: { turns: Schema.Array(Schema.Number) },
  CompletedWaitBeforeCooling: {}
})

const WaitBeforeCooling = Command.make(
  "WaitBeforeCooling",
  { args: { timeout: Schema.Number }, mode: "switch" },
  ({ timeout }) => Effect.as(Effect.sleep(Duration.millis(timeout)), ProviderMessage.CompletedWaitBeforeCooling())
)

/**
 * Groups the tooltips below it, so that once one has been open, hovering
 * another opens it at once instead of after its `delay`.
 *
 * **Details**
 *
 * Wrap a toolbar or a row of buttons. The tooltips below need nothing
 * extra: each `Tooltip` reads the nearest provider if there is one, and
 * behaves as on its own if there isn't.
 *
 * Each tooltip reports whether it shows, from its `open` prop. So the
 * group follows the tooltips the consumer actually shows, not the
 * `Opened` and `Dismissed` requests: a refused close keeps the group open,
 * and a close the consumer makes on its own starts the window. While any
 * tooltip shows, and for `timeout` milliseconds after the last one closes,
 * a hover on another trigger opens it with no delay, and its popup and
 * arrow get `data-instant="delay"`. A tooltip that closes while another in
 * the group shows gets it too, so the swap skips both transitions. After
 * the window, the next hover waits the tooltip's `delay` again.
 *
 * Only one tooltip of the group shows at a time. When a tooltip is shown,
 * every other one that still shows asks to close with one `Dismissed`,
 * even if keyboard focus or `closeDelay` would hold it open. A consumer
 * that refuses keeps it on screen, and the request isn't repeated until yet
 * another tooltip takes over. A tooltip knows it was replaced by its turn:
 * each one takes the group's next turn once it is shown, however it was
 * opened, and the highest turn that shows is the newest. Two tooltips
 * shown in the same update take the same turn, so neither replaces the
 * other.
 *
 * The decision is made when the pointer enters the trigger: a hover
 * already waiting out its delay isn't cut short.
 *
 * Every tooltip below re-renders when the group opens, when another
 * tooltip takes over, when its last tooltip closes and when the window
 * ends. Wrap a toolbar or a row group, not a whole table.
 *
 * One Model field for which tooltip is open, such as
 * `tip: "bold" | "italic" | null` with `open: model.tip === "bold"`, closes
 * the previous tooltip in the same update that accepts the next one's
 * `Opened`. With a field per tooltip, the previous one's `Dismissed` closes
 * it.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const TooltipProvider = Component.define({
  name: "TooltipProvider",
  scoped: false,
  props: TooltipProviderProps,
  // `open`: a tooltip below shows. `instant`: the next hover skips its
  // delay, while one shows and for `timeout` after the last one closed.
  // `turns`: the turns that show, so every change reaches the readers.
  // `next`: the turn the next tooltip to be shown takes.
  model: Schema.Struct({
    open: Schema.Boolean,
    instant: Schema.Boolean,
    turns: Schema.Array(Schema.Number),
    next: Schema.Number
  }),
  message: ProviderMessage,
  shares: {
    value: (model) => ({ open: model.open, instant: model.instant, turns: model.turns, next: model.next }),
    collects: {
      // Each tooltip's turn while it shows, `null` while it doesn't.
      schema: Schema.NullOr(Schema.Number),
      onChange: (collected) =>
        ProviderMessage.ChangedShown({
          turns: collected.filter((turn): turn is number => turn !== null).sort((a, b) => a - b)
        })
    }
  },
  elements: Html
}).make({
  init: () => ({ open: false, instant: false, turns: [], next: 1 }),
  update: {
    ChangedShown: (model, { turns }, $) => {
      const open = turns.length > 0
      const next = { ...model, open, turns, next: Math.max(model.next, ...turns.map((turn) => turn + 1)) }
      if (open) return $.set({ ...next, instant: true }).run(Command.interrupt(WaitBeforeCooling))
      // The last one closed: the window starts.
      if (model.open) {
        return $.set({ ...next, instant: true }).run(WaitBeforeCooling({ timeout: $.props.timeout ?? 400 }))
      }
      return next
    },
    CompletedWaitBeforeCooling: (model) => (model.open ? model : { ...model, instant: false })
  },
  parts: () => ({})
})

/**
 * A headless tooltip. Call it with the consumer's `h` and a `view` closure
 * that draws the button the tooltip describes with `tooltip.trigger`, and the
 * popup's markup with `tooltip.positioner`, `tooltip.popup` and `tooltip.arrow`.
 *
 * **Details**
 *
 * The parts also return `open`, `side` and `align`, resolved, for markup
 * that depends on them. `open` is false while the tooltip is disabled.
 *
 * Every part takes the consumer's builder and returns it with the part
 * applied, so the consumer goes on chaining and adds the children. The
 * result is still a builder, so it can be another kit call's `element`,
 * such as a ui-kit Button's. The positioner and the popup can stay in the
 * view while the tooltip is closed: the popover hides them.
 *
 * The tooltip's own attributes win over the ones the consumer set on the
 * builder it passes in: the data attributes on every part, `popover` and
 * `role="presentation"` on the positioner, and `aria-hidden` on the arrow.
 * That includes the ones a state leaves absent, so a `data-open` on the
 * consumer's popup is removed while the tooltip is closed. The
 * positioner's placement and the arrow's offset are added after the
 * consumer's inline style, including one chained after the part. Other
 * attributes the consumer chains after a part are the consumer's. A
 * handler the consumer adds to a part runs after the tooltip's own.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Tooltip = Component.define({
  name: "Tooltip",
  scoped: false,
  props: TooltipProps,
  model: Model,
  message: Message,
  events: TooltipEvents,
  // A TooltipProvider above, if there is one. Each tooltip tells it its turn
  // while it shows, and hears when the shown tooltips change.
  shared: {
    provider: {
      owner: TooltipProvider,
      optional: true,
      report: (model, props) => (shownBy(props) ? model.turn : null),
      onChange: (value) => Message.ChangedGroup({ newest: newestOf(value.turns), next: value.next })
    }
  },
  elements: Html
}).make({
  init: () => ({
    hovered: false,
    focused: false,
    pressed: false,
    instant: null,
    turn: 0,
    yieldedTo: null,
    placement: null
  }),
  update: {
    EnteredTrigger: (model, _message, $) => {
      const next = { ...model, hovered: true }
      if ($.props.disabled === true) return next
      if (shownBy($.props)) return $.set(next).run(Command.interrupt(WaitBeforeClosing))
      // A provider's group is open, or closed less than `timeout` ago.
      if ($.shared.provider?.instant === true) {
        return $.set({ ...next, instant: "delay" }).run(Command.interrupt(WaitBeforeOpening)).emit(opened)
      }
      return $.set(next).run(WaitBeforeOpening({ delay: $.props.delay ?? 600 }))
    },
    LeftTrigger: left,
    EnteredPositioner: (model, _message, $) =>
      $.set({ ...model, hovered: true }).run(Command.interrupt(WaitBeforeClosing)),
    LeftPositioner: left,
    FocusedTrigger: (model, _message, $) => {
      const next = { ...model, focused: !model.pressed, pressed: false }
      if (model.pressed || $.props.disabled === true || shownBy($.props)) return next
      return $.set({ ...next, instant: "focus" }).run(Command.interrupt(WaitBeforeOpening)).emit(opened)
    },
    BlurredTrigger: (model, _message, $) => {
      const next = { ...model, focused: false, pressed: false }
      return shownBy($.props) && !model.hovered ? $.set(next).emit(dismissed) : next
    },
    // A mouse press only marks the focus that follows it, and stops a
    // pending open. The click that follows, or Enter or Space on the
    // native button, closes an open tooltip.
    PressedTrigger: (model, _message, $) => {
      const next = { ...model, pressed: true }
      return $.props.closeOnClick !== false ? $.set(next).run(Command.interrupt(WaitBeforeOpening)) : next
    },
    ClickedTrigger: (model, _message, $) => $.props.closeOnClick !== false ? dismiss(model, $, "dismiss") : model,
    PressedEscape: (model, _message, $) => dismiss(model, $, "dismiss"),
    // A press is outside the tooltip when the pointer is on neither the
    // trigger nor the positioner.
    PressedDocument: (model, _message, $) => model.hovered ? model : dismiss(model, $),
    CompletedWaitBeforeOpening: (model, _message, $) =>
      $.props.disabled !== true && !$.props.open && model.hovered
        ? $.set({ ...model, instant: null }).emit(opened)
        : model,
    CompletedWaitBeforeClosing: (model, _message, $) =>
      shownBy($.props) && !model.hovered && !model.focused
        ? $.set({ ...model, instant: null }).emit(dismissed)
        : model,
    // The shown tooltips of the group changed. Its turn follows whether it
    // is shown, as the consumer decided, not whether it asked: a closed
    // tooltip gives its turn up, and a newly shown one takes the next.
    // Another tooltip shown after this one asks it to close once, whatever
    // holds it open, so a refusal isn't met with a second request.
    ChangedGroup: (model, { newest, next }, $) => {
      if (!shownBy($.props)) return { ...model, turn: 0, yieldedTo: null }
      if (model.turn === 0) return { ...model, turn: next, yieldedTo: null }
      return newest !== null && newest !== model.turn && newest !== model.yieldedTo
        ? $.set({ ...model, yieldedTo: newest }).run(Command.interrupt(WaitBeforeClosing)).emit(dismissed)
        : model
    },
    ChangedPlacement: (model, { placement }) => ({ ...model, placement })
  },
  // Only an open tooltip listens on the document.
  subscriptions: (_model, props) => shownBy(props) ? dismissals : [],
  parts: (model, p) => {
    const shown = shownBy(p.props)
    const placement = model.placement
    const triggerId = p.id("trigger")
    const arrowId = p.id("arrow")
    const tracked = Positioning.trackArgs(p.props, {
      side: "top",
      anchorSelector: `[data-tooltip-trigger="${triggerId}"]`,
      arrowId,
      offsetAsPadding: true
    })
    const side = placement?.side ?? tracked.options.side
    const align = placement?.align ?? tracked.options.align
    // An attribute a part sets to `undefined` is removed from the
    // consumer's builder too, so a consumer's `data-open` can't report a
    // state the tooltip isn't in.
    const placed = <B extends { readonly attr: (name: string, value: string | undefined) => B }>(builder: B): B =>
      builder
        .attr("data-open", flag(shown))
        .attr("data-closed", flag(!shown))
        .attr("data-side", side)
        .attr("data-align", align)
    const group = p.shared.provider
    // Closed while another tooltip of the group shows: this one was replaced.
    const instantBy = !shown && group?.open === true ? "delay" : model.instant
    const instant = <B extends { readonly attr: (name: string, value: string | undefined) => B }>(builder: B): B =>
      placed(builder).attr("data-instant", instantBy ?? undefined)
    const trigger = p.part(
      "button",
      (b) =>
        b.attr("data-popup-open", flag(shown))
          .attr("data-trigger-disabled", flag(p.props.disabled))
          .on("mouseenter", Message.EnteredTrigger())
          .on("mouseleave", Message.LeftTrigger())
          .on("mousedown", Message.PressedTrigger())
          .onClick(Message.ClickedTrigger())
          .onFocus(Message.FocusedTrigger())
          .onBlur(Message.BlurredTrigger())
          .attr("data-tooltip-trigger", triggerId)
    )
    const style = Positioning.positionerStyle(tracked.positionMethod) +
      (p.props.disableHoverablePopup === true ? ";pointer-events:none" : "")
    const positioner = p.part("div", (b) => {
      const decorated = placed(b)
        .attr("role", "presentation")
        .attr("data-anchor-hidden", flag(shown && placement?.anchorHidden))
        .popover("manual", shown)
        .forward((node) => node.attr("style", withStyle(node.attrs.style, style)))
      const hoverable = p.props.disableHoverablePopup === true
        ? decorated
        : decorated.on("mouseenter", Message.EnteredPositioner()).on("mouseleave", Message.LeftPositioner())
      return shown
        ? hoverable.onMount(
          Positioning.TrackPosition(tracked).pipe(Mount.map((placement) => Message.ChangedPlacement({ placement })))
        )
        : hoverable
    })
    const popup = p.part("div", instant)
    const arrowStyle = Positioning.arrowStyle(side)
    const arrow = p.part("div", (b) =>
      instant(b)
        .attr("id", arrowId)
        .attr("aria-hidden", "true")
        .attr("data-uncentered", flag(placement?.arrowUncentered))
        .forward((node) => node.attr("style", withStyle(node.attrs.style, arrowStyle))))
    return {
      open: shown,
      side,
      align,
      trigger,
      positioner,
      popup,
      arrow
    }
  }
})
