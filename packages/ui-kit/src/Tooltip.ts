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
 * | `positioner` | `<div>`, a manual popover placed by the anchor |
 * | `popup`      | `<div>` inside the positioner                  |
 * | `arrow`      | `<div>` inside the popup                       |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children:
 * `s.positioner(h.div).children(s.popup(h.div).children("Bold"))`.
 * A part's result is a builder, so it can also be another kit call's
 * `element`. That puts a tooltip on a ui-kit Button:
 * `Button(h, { element: s.trigger(h.button) }).class("tool").children("B")`.
 *
 * The positioner is a manual popover, so it renders in the top layer and
 * needs no portal. It's placed against the trigger with CSS anchor
 * positioning: the trigger gets an `anchor-name` and the positioner the
 * matching `position-anchor`, with a `position-area` from the `side` and
 * `align` props. `sideOffset` is padding on the positioner's side facing the
 * trigger, so the gap is part of the positioner and the pointer can cross it
 * to the popup without leaving the tooltip. Both parts add these
 * declarations after the consumer's own inline style. The browser gives a
 * popover a border, padding, a background and `overflow: auto`, so reset
 * those on the positioner and style the popup instead.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except `data-side`,
 * `data-align` and `data-instant`, which hold a value:
 *
 * - `trigger`: `data-popup-open`, `data-trigger-disabled`
 * - `positioner`: `data-open` / `data-closed`, `data-side`, `data-align`
 * - `popup`: `data-open` / `data-closed`, `data-side`, `data-align`,
 *   `data-instant`
 * - `arrow`: `data-open` / `data-closed`, `data-side`, `data-align`,
 *   `data-instant`
 *
 * `data-instant` is `focus` when focus opened the tooltip, `dismiss` when
 * a click on the trigger or Escape closed it, and `delay` when a
 * `TooltipProvider` let it open without its hover delay or another tooltip
 * of the group replaced it, so a transition can be skipped.
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
 * The browser can flip the popup to the opposite side when it doesn't fit.
 * `data-side` still reports the requested side. If you render an arrow,
 * position it against the popup in your CSS. To animate the popover, use
 * `@starting-style` and `transition-behavior: allow-discrete`.
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
 * const ToolbarMessage = UiSchema.TaggedEnum({ ToggledBoldTip: { open: Schema.Boolean } })
 *
 * const Toolbar = Component.define({
 *   name: "Toolbar",
 *   model: Schema.Struct({ boldTip: Schema.Boolean }),
 *   message: ToolbarMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ boldTip: false }),
 *   update: (model, message) =>
 *     ToolbarMessage.match(message, {
 *       ToggledBoldTip: ({ open }) => ({ ...model, boldTip: open })
 *     }),
 *   view: (model, h) =>
 *     Tooltip(h, {
 *       key: "bold",
 *       props: { open: model.boldTip, sideOffset: 8 },
 *       onEmit: (event) => ToolbarMessage.ToggledBoldTip({ open: event._tag === "Opened" }),
 *       view: (s) =>
 *         h.span(
 *           s.trigger(h.button.class("tool").attr("aria-label", "Bold")).children("B"),
 *           s.positioner(h.div.class("tip-positioner")).children(
 *             s.popup(h.div.class("tip")).children(s.arrow(h.div.class("tip-arrow")), "Bold")
 *           )
 *         )
 *     })
 * })
 *
 * // The positioner is a manual popover, placed against the trigger's anchor.
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
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

/**
 * The side of the trigger a tooltip shows on.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const TooltipSide = Schema.Literals(["top", "bottom", "left", "right"])

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
export const TooltipAlign = Schema.Literals(["start", "center", "end"])

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
 * - `align`: how the popup lines up with the trigger along that side,
 *   `"center"` by default.
 * - `sideOffset`: the gap between the trigger and the popup, in pixels.
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
  side: Schema.optional(TooltipSide),
  align: Schema.optional(TooltipAlign),
  sideOffset: Schema.optional(Schema.Number)
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
  // `instant`: what a TooltipProvider above shared when the trigger last
  // rendered. `update` can't read shared state, so the value comes in here.
  EnteredTrigger: { instant: Schema.Boolean },
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
  ChangedGroup: { newest: Schema.NullOr(Schema.Number), next: Schema.Number }
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
  yieldedTo: Schema.NullOr(Schema.Number)
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
const TrackDismissal = Mount.makeStream(
  "TrackDismissal",
  { args: {} },
  (node: HTMLElement) =>
    Stream.callback<"PressedEscape" | "PressedDocument">((queue) => {
      const document = node.ownerDocument
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return
        event.preventDefault()
        Queue.offerUnsafe(queue, "PressedEscape")
      }
      const onMouseDown = () => Queue.offerUnsafe(queue, "PressedDocument")
      return Effect.acquireRelease(
        Effect.sync(() => {
          document.addEventListener("keydown", onKeyDown)
          document.addEventListener("mousedown", onMouseDown, true)
        }),
        () =>
          Effect.sync(() => {
            document.removeEventListener("keydown", onKeyDown)
            document.removeEventListener("mousedown", onMouseDown, true)
          })
      )
    })
)

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

// A data attribute is present, with an empty value, or absent.
const flag = (on: boolean | undefined): string | undefined => on === true ? "" : undefined

// `position-area` for each side and alignment. `x-start` and `y-start`
// follow the writing direction.
const areas: Record<TooltipSide, Record<TooltipAlign, string>> = {
  top: { start: "top span-x-end", center: "top", end: "top span-x-start" },
  bottom: { start: "bottom span-x-end", center: "bottom", end: "bottom span-x-start" },
  left: { start: "left span-y-end", center: "left", end: "left span-y-start" },
  right: { start: "right span-y-end", center: "right", end: "right span-y-start" }
}

// The gap is padding on the side facing the trigger, so the pointer is
// still on the positioner while it crosses to the popup.
const gaps: Record<TooltipSide, string> = {
  top: "padding-bottom",
  bottom: "padding-top",
  left: "padding-right",
  right: "padding-left"
}

// The popover's UA style centres it in the viewport with `inset: 0` and
// `margin: auto`. Both go, so `position-area` places it.
const placement = (anchor: string, props: TooltipProps): string => {
  const side = props.side ?? "top"
  return [
    `position-anchor:${anchor}`,
    `position-area:${areas[side][props.align ?? "center"]}`,
    `position-try-fallbacks:${side === "top" || side === "bottom" ? "flip-block" : "flip-inline"}`,
    "inset:auto",
    "margin:0",
    `${gaps[side]}:${props.sideOffset ?? 0}px`,
    // Let pointer events pass through a non-hoverable popup.
    props.disableHoverablePopup === true ? "pointer-events:none" : undefined
  ].filter((declaration) => declaration !== undefined).join(";")
}

// The trigger and the positioner add their declarations, in `forward`,
// after the consumer's inline style, so theirs win and the consumer's
// others stay, including a style chained after the part.
const withStyle = (consumer: string | undefined, own: string): string =>
  consumer === undefined || consumer.trim() === "" ? own : consumer.replace(/;\s*$/, "") + ";" + own

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
  update: (model, message, $) =>
    ProviderMessage.match(message, {
      ChangedShown: ({ turns }) => {
        const open = turns.length > 0
        const next = { ...model, open, turns, next: Math.max(model.next, ...turns.map((turn) => turn + 1)) }
        if (open) return $.set({ ...next, instant: true }).run(Command.interrupt(WaitBeforeCooling))
        // The last one closed: the window starts.
        if (model.open) {
          return $.set({ ...next, instant: true }).run(WaitBeforeCooling({ timeout: $.props.timeout ?? 400 }))
        }
        return next
      },
      CompletedWaitBeforeCooling: () => (model.open ? model : { ...model, instant: false })
    }),
  parts: () => ({})
})

/**
 * A headless tooltip. Call it with the consumer's `h` and a `view` closure
 * that draws the button the tooltip describes with `s.trigger`, and the
 * popup's markup with `s.positioner`, `s.popup` and `s.arrow`.
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
 * consumer's popup is removed while the tooltip is closed. The trigger's
 * `anchor-name` and the positioner's placement are added after the
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
  init: () => ({ hovered: false, focused: false, pressed: false, instant: null, turn: 0, yieldedTo: null }),
  update: (model, message, $) => {
    const props = $.props
    const enabled = props.disabled !== true
    const shown = shownBy(props)
    // The user closed the tooltip. Any wait for `closeDelay` is over.
    const dismiss = (instant = model.instant) =>
      $.set({ ...model, instant }).run(Command.interrupt(WaitBeforeClosing)).emit(dismissed)
    // The pointer left the trigger or the positioner: a pending open stops, and
    // an open tooltip closes after `closeDelay` unless keyboard focus holds it.
    const left = () => {
      const next = { ...model, hovered: false, pressed: false }
      if (!shown) return $.set(next).run(Command.interrupt(WaitBeforeOpening))
      if (model.focused) return next
      return $.set(next).run(WaitBeforeClosing({ delay: props.closeDelay ?? 0 }))
    }
    return Message.match(message, {
      EnteredTrigger: ({ instant }) => {
        const next = { ...model, hovered: true }
        if (!enabled) return next
        if (shown) return $.set(next).run(Command.interrupt(WaitBeforeClosing))
        // A provider's group is open, or closed less than `timeout` ago.
        if (instant) return $.set({ ...next, instant: "delay" }).run(Command.interrupt(WaitBeforeOpening)).emit(opened)
        return $.set(next).run(WaitBeforeOpening({ delay: props.delay ?? 600 }))
      },
      LeftTrigger: left,
      EnteredPositioner: () => $.set({ ...model, hovered: true }).run(Command.interrupt(WaitBeforeClosing)),
      LeftPositioner: left,
      FocusedTrigger: () => {
        const next = { ...model, focused: !model.pressed, pressed: false }
        if (model.pressed || !enabled || shown) return next
        return $.set({ ...next, instant: "focus" }).run(Command.interrupt(WaitBeforeOpening)).emit(opened)
      },
      BlurredTrigger: () => {
        const next = { ...model, focused: false, pressed: false }
        return shown && !model.hovered ? $.set(next).emit(dismissed) : next
      },
      // A mouse press only marks the focus that follows it, and stops a
      // pending open. The click that follows, or Enter or Space on the
      // native button, closes an open tooltip.
      PressedTrigger: () => {
        const next = { ...model, pressed: true }
        return props.closeOnClick !== false ? $.set(next).run(Command.interrupt(WaitBeforeOpening)) : next
      },
      ClickedTrigger: () => shown && props.closeOnClick !== false ? dismiss("dismiss") : model,
      PressedEscape: () => shown ? dismiss("dismiss") : model,
      // A press is outside the tooltip when the pointer is on neither the
      // trigger nor the positioner.
      PressedDocument: () => shown && !model.hovered ? dismiss() : model,
      CompletedWaitBeforeOpening: () =>
        enabled && !props.open && model.hovered ? $.set({ ...model, instant: null }).emit(opened) : model,
      CompletedWaitBeforeClosing: () =>
        shown && !model.hovered && !model.focused ? $.set({ ...model, instant: null }).emit(dismissed) : model,
      // The shown tooltips of the group changed. Its turn follows whether it
      // is shown, as the consumer decided, not whether it asked: a closed
      // tooltip gives its turn up, and a newly shown one takes the next.
      // Another tooltip shown after this one asks it to close once, whatever
      // holds it open, so a refusal isn't met with a second request.
      ChangedGroup: ({ newest, next }) => {
        if (!shown) return { ...model, turn: 0, yieldedTo: null }
        if (model.turn === 0) return { ...model, turn: next, yieldedTo: null }
        return newest !== null && newest !== model.turn && newest !== model.yieldedTo
          ? $.set({ ...model, yieldedTo: newest }).run(Command.interrupt(WaitBeforeClosing)).emit(dismissed)
          : model
      }
    })
  },
  parts: (model, p) => {
    const shown = shownBy(p.props)
    const side = p.props.side ?? "top"
    const align = p.props.align ?? "center"
    // Ids are letters, digits, `_` and `-`, so this is a valid dashed ident.
    const anchor = "--" + p.id("anchor")
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
          .on("mouseenter", Message.EnteredTrigger({ instant: group?.instant === true }))
          .on("mouseleave", Message.LeftTrigger())
          .on("mousedown", Message.PressedTrigger())
          .onClick(Message.ClickedTrigger())
          .onFocus(Message.FocusedTrigger())
          .onBlur(Message.BlurredTrigger())
          .forward((node) => node.attr("style", withStyle(node.attrs.style, `anchor-name:${anchor}`)))
    )
    const positioner = p.part("div", (b) => {
      let decorated = placed(b)
        .attr("role", "presentation")
        .popover("manual", shown)
        .forward((node) => node.attr("style", withStyle(node.attrs.style, placement(anchor, p.props))))
      if (p.props.disableHoverablePopup !== true) {
        decorated = decorated
          .on("mouseenter", Message.EnteredPositioner())
          .on("mouseleave", Message.LeftPositioner())
      }
      // Only an open tooltip listens on the document.
      return shown ? decorated.onMount(TrackDismissal().pipe(Mount.map((tag) => Message[tag]()))) : decorated
    })
    const popup = p.part("div", instant)
    const arrow = p.part("div", (b) => instant(b).attr("aria-hidden", "true"))
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
