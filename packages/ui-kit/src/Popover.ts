/**
 * A popup anchored to a trigger, for content the user asks for and can act
 * on, such as a filter form, a profile card or a list of notifications.
 *
 * `Popover` is headless: it is a non-modal `Dialog` placed next to its trigger by
 * `Positioning`. It owns the ids, the ARIA, the data attributes, focus,
 * dismissal and the popup's position, and the consumer draws the markup. The
 * consumer owns whether the popover is open, passes it as `open`, and stores
 * what the `RequestedOpen` and `RequestedClose` events ask for. The popover
 * stays as it is until `open` changes, so a consumer can refuse a close.
 *
 * **Anatomy**
 *
 * | Part           | Element                                                   |
 * | :------------- | :-------------------------------------------------------- |
 * | `trigger`      | `<button>` that opens the popover                         |
 * | `portal`       | `<dialog>` in the top layer, around the parts below        |
 * | `backdrop`     | `<div>` that covers the page                              |
 * | `positioner`   | `<div>` placed next to the trigger                        |
 * | `popup`        | `<div>` with the popover's content                        |
 * | `viewport`     | `<div>` around content that changes with the trigger      |
 * | `arrow`        | `<div>` that points at the trigger                        |
 * | `title`        | a heading, `<h1>` to `<h6>`, that labels the popover        |
 * | `description`  | `<p>` that describes the popover                          |
 * | `close`        | `<button>` that closes the popover                        |
 * | `initialFocus` | any element, focused when the popover opens               |
 * | `finalFocus`   | any element, focused when the popover closes              |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children:
 * `popover.portal(h.dialog)?.children(popover.positioner(h.div).children(popover.popup(h.div).children("Saved")))`.
 * The trigger takes an options object, `popover.trigger({ element: h.button })`,
 * since each trigger has its own hover options. The portal returns `undefined`
 * while the popover is closed, unless `keepMounted`. `backdrop`, `viewport`
 * and `arrow` are optional.
 *
 * The portal is a `<dialog>` shown as a manual popover, so the popup sits in
 * the top layer and needs no portal to another place in the document. The kit
 * resets its box inline to an empty one with nothing visible of its own, at
 * the document's origin, or at the viewport's corner with
 * `positionMethod: "fixed"`. The positioner is placed inside it, so style the
 * popup and the arrow, and a backdrop as a fixed layer:
 * `.backdrop { position: fixed; inset: 0 }`.
 *
 * The positioner's inline style carries `left` and `top`, and the variables
 * `--anchor-width`, `--anchor-height`, `--available-width`,
 * `--available-height` and `--transform-origin`. `sideOffset` is padding on
 * the positioner's side facing the trigger, so the pointer can cross the gap
 * without leaving a popover opened by hover.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except the ones with a value:
 *
 * - `trigger`: `data-popup-open`, `data-pressed` while the popover is open
 *   for it by a press, `data-disabled`
 * - `backdrop`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`
 * - `positioner`: `data-open` / `data-closed`, `data-side`, `data-align`,
 *   `data-anchor-hidden`, `data-instant`
 * - `popup`: the backdrop's, and `data-side`, `data-align`, `data-instant`
 * - `viewport`: `data-transitioning`, `data-activation-direction`,
 *   `data-instant`
 * - `arrow`: `data-open` / `data-closed`, `data-side`, `data-align`,
 *   `data-uncentered`
 *
 * `data-side` and `data-align` name where the popup ended up, after it flipped
 * or shifted to fit. `data-instant` names a change that should skip its
 * transition: `click` for a trigger pressed with the keyboard, `dismiss` for
 * Escape, `focus` for focus leaving, and `trigger-change` once the popup has
 * moved to another trigger, until it closes. `data-starting-style` is present
 * for the first frame after the popover opens and `data-ending-style` while it
 * closes. The popover stays shown until the popup's own transitions and
 * animations finish, then closes and emits `Settled`.
 *
 * **Keyboard**
 *
 * The trigger and the close button are native buttons, so Enter and Space
 * press them. Escape asks the popover to close, wherever focus is. When the
 * popover opens by a press, focus moves to the `initialFocus` element, or
 * else to the first element in the popup that Tab reaches, or else to the
 * popup. Tab leaves the popup for the page, and the popover then asks to
 * close with `focus-out`. As a close starts with focus in the popup, focus
 * goes back to the trigger, and the popup is `inert` through its exit.
 * `Dialog` describes the rest, which is the same here.
 *
 * **Modes**
 *
 * - `modal: false`, the default: the page stays usable.
 * - `modal: "trap-focus"`: focus stays inside, and the page still scrolls and
 *   takes clicks.
 * - `modal: true`: the page behind takes no presses and doesn't scroll, and
 *   focus stays inside. A press on the trigger then counts as a press outside.
 *
 * **Hover**
 *
 * A trigger with `openOnHover` asks the popover to open once the mouse has
 * rested on it for `delay` milliseconds, 300 by default, with the reason
 * `trigger-hover`. A popover opened that way takes no focus, is never modal,
 * doesn't close when focus moves, and its backdrop takes no presses. It asks
 * to close, with `trigger-hover`, `closeDelay` milliseconds after the pointer
 * has left both the trigger and the positioner. A layer that covers the
 * trigger and gives the pointer back where it rested is no new hover. A press
 * on the trigger within 500 milliseconds of the hover keeps it open, as a
 * popover opened by a press, so a click that was already on its way doesn't
 * close it. After that a press closes it. Hovering another trigger with
 * `openOnHover` while the popover is open moves it there at once.
 *
 * **Several triggers**
 *
 * Every trigger reports its `id` in `RequestedOpen`, the consumer's or a
 * generated one. Store it and pass it as `triggerId`: the popup is placed
 * against that trigger, and the consumer draws the content for it.
 * `popover.triggerId` is the one the popover is open for.
 *
 * To animate the content as the popover moves from one trigger to another,
 * draw it inside `popover.viewport(h.div)`, in the popup. The viewport puts
 * its children in a `<div data-current>`. While the popover moves, it keeps
 * what the last trigger showed in a `<div data-previous>` before it, inert and
 * out of the flow, has `data-transitioning`, and names where the new trigger
 * is from the last one in `data-activation-direction`: `left` or `right`, a
 * space, then `up` or `down`, each left out within 5 pixels. The new content
 * has `data-starting-style` for the first frame and the old one
 * `data-ending-style` after it, and the old content is removed once the new
 * content's transitions finish.
 *
 * With a viewport, the positioner's inline style also carries
 * `--positioner-width` and `--positioner-height`, the popup's size for the
 * current content, and the popup's `--popup-width` and `--popup-height`.
 * Those two are `auto`, except while the popover moves: they then go from the
 * old content's size to the new one's, so
 * `.popup { width: var(--popup-width, auto); transition: width 200ms }`
 * animates the resize. The `data-previous` container carries the old size in
 * the same two variables.
 *
 * A `PopoverTrigger` opens a popover from another part of the page. Give the
 * popover an `id` and the trigger the same `popupId`. Its presses and hovers
 * reach the popover by themselves, so they arrive as the popover's own
 * `RequestedOpen` and `RequestedClose`.
 *
 * **Inside a dialog**
 *
 * A popover drawn inside a `Dialog`'s popup doesn't count as a nested dialog:
 * the dialog gets no `data-nested-dialog-open`. Escape and a press outside
 * reach the popover first.
 *
 * **Limits**
 *
 * - There is no `payload`, handle or `defaultOpen`: `open` and `triggerId` live
 *   in the consumer's Model, which also decides the content.
 * - A trigger inside a toolbar doesn't keep the arrow keys from the toolbar
 *   while the popover is open.
 *
 * **Example** (A popover whose open state lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Popover } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const InboxMessage = UiSchema.TaggedEnum({ RequestedOpenNotifications: {}, RequestedCloseNotifications: {} })
 *
 * const Inbox = Component.define({
 *   name: "Inbox",
 *   scoped: false,
 *   model: Schema.Struct({ notifications: Schema.Boolean }),
 *   message: InboxMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ notifications: true }),
 *   update: {
 *     RequestedOpenNotifications: (_model, _message, $) => $.evolve({ notifications: true }),
 *     RequestedCloseNotifications: (_model, _message, $) => $.evolve({ notifications: false })
 *   },
 *   view: (model, h) =>
 *     Popover(h, {
 *       props: { open: model.notifications, sideOffset: 8 },
 *       onEmit: {
 *         RequestedOpen: () => InboxMessage.RequestedOpenNotifications(),
 *         RequestedClose: () => InboxMessage.RequestedCloseNotifications(),
 *         Settled: () => undefined
 *       },
 *       view: (popover) =>
 *         h.div(
 *           popover.trigger({ element: h.button }).children("Notifications"),
 *           popover.portal(h.dialog)?.children(
 *             popover.positioner(h.div).children(
 *               popover.popup(h.div).children(
 *                 popover.arrow(h.div),
 *                 popover.title(h.h2).children("Notifications"),
 *                 popover.description(h.p).children("You are all caught up."),
 *                 popover.close(h.button).children("Close")
 *               )
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Inbox, {}))
 * if (!html.includes("data-side=\"bottom\"")) throw new Error("the popup doesn't name its side")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as UiStruct from "@effect/ui/UiStruct"
import * as View from "@effect/ui/View"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Struct from "effect/Struct"
import {
  Dialog,
  DialogDismissReason,
  DialogInteraction,
  DialogProps,
  type DialogTransitionStatus,
  DialogTrigger,
  type DialogTriggerElement
} from "./Dialog.ts"
import { type Attributed, attrSelector, flag, idOf, idSelector, type Keyed, withStyle } from "./internal/attributes.ts"
import { detachedChannel } from "./internal/detached.ts"
import { methodOf, Point, pointOf } from "./internal/interaction.ts"
import { atDocumentOrigin } from "./internal/topLayer.ts"
import { frameOf, whenFinished } from "./internal/transition.ts"
import {
  stepViewport,
  TrackViewport,
  ViewportChange,
  viewportContent,
  ViewportTransition
} from "./internal/viewport.ts"
import * as Positioning from "./Positioning.ts"

/**
 * The side of the trigger a popover shows on.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PopoverSide = Positioning.Side

/**
 * The side of the trigger a popover shows on.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PopoverSide = typeof PopoverSide.Type

/**
 * How a popover lines up with its trigger along the side it shows on.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PopoverAlign = Positioning.Align

/**
 * How a popover lines up with its trigger along the side it shows on.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PopoverAlign = typeof PopoverAlign.Type

/**
 * Controls whether the popover is open, how it treats the page behind it,
 * where focus goes, and where the popup appears.
 *
 * **Details**
 *
 * - `open`: whether the popover shows. Required: the consumer owns it.
 * - `modal`: `false` by default, `"trap-focus"` or `true`, as the module
 *   describes. A popover opened by hover is never modal.
 * - `triggerId`: the `id` of the trigger the popover is open for, from
 *   `RequestedOpen`. The popup is placed against it, only it gets
 *   `aria-expanded` and `data-popup-open`, and focus goes back to it. With
 *   none, the popover remembers the trigger that last asked to open it.
 * - `keepMounted`: the portal stays in the page while the popover is closed,
 *   hidden.
 * - `initialFocus`: `false` leaves focus where it is when the popover opens.
 * - `finalFocus`: `false` leaves focus where it is when the popover closes.
 * - `id`: the portal's `id`, generated when left out. Set it to pair the
 *   popover with a `PopoverTrigger` drawn somewhere else, as its `popupId`.
 * - `openMethod`: how the user opened the popover, when the consumer opens it
 *   by itself. It wins over the one a trigger's press records, and decides
 *   the focus of a touch open.
 * - `holdExit`: a closed popover stays shown, in its ending state, while this
 *   is `true`, for an exit animation that the consumer runs itself.
 * - `side`: the side of the trigger the popup shows on, `"bottom"` by
 *   default. `"inline-start"` and `"inline-end"` follow the writing direction.
 * - `align`: how the popup lines up with the trigger along that side,
 *   `"center"` by default.
 * - `sideOffset`: the gap between the trigger and the popup, in pixels.
 * - `alignOffset`: pixels the popup moves along the side.
 * - `collisionAvoidance`, `collisionBoundary`, `collisionPadding`, `sticky`,
 *   `arrowPadding`, `disableAnchorTracking`: as `Positioning` describes them.
 * - `positionMethod`: `"absolute"`, the default, which scrolls with the page,
 *   or `"fixed"`, which is placed again on every scroll and doesn't make the
 *   page taller when the popup reaches past its end.
 * - `anchor`: the id of an element, or a `Rect` in the viewport, to place
 *   the popup against instead of the trigger.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PopoverProps = Schema.Struct({
  ...Struct.pick(DialogProps.fields, [
    "open",
    "modal",
    "triggerId",
    "keepMounted",
    "initialFocus",
    "finalFocus",
    "id",
    "openMethod",
    "holdExit"
  ]),
  ...Positioning.PositionerFields
})

/**
 * The props of a `Popover`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PopoverProps = typeof PopoverProps.Type

/**
 * Why a popover asks to open: a press on a trigger, or the mouse resting on
 * one with `openOnHover`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PopoverOpenReason = Schema.Literals(["trigger-press", "trigger-hover"])

/**
 * Why a popover asks to open.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PopoverOpenReason = typeof PopoverOpenReason.Type

/**
 * Why a popover asks to close: a `Dialog`'s reasons, or the pointer leaving a
 * popover that was opened by hover.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PopoverDismissReason = Schema.Literals([...DialogDismissReason.literals, "trigger-hover"])

/**
 * Why a popover asks to close.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PopoverDismissReason = typeof PopoverDismissReason.Type

/**
 * `RequestedOpen` asks for the popover to open, with the `id` of the trigger
 * and the reason. It is also emitted while the popover is open, when another
 * trigger asks for it, or when a press keeps a popover that hover opened.
 * `RequestedClose` asks for it to close, with the reason. The consumer
 * decides whether to change `open`. `Settled` reports that the transitions and
 * animations of an open or a close finished.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PopoverEvents = UiSchema.TaggedEnum({
  RequestedOpen: { triggerId: Schema.NullOr(Schema.String), reason: PopoverOpenReason },
  RequestedClose: { reason: PopoverDismissReason },
  Settled: { open: Schema.Boolean }
})

/**
 * What a `Popover` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PopoverEvents = typeof PopoverEvents.Type

/**
 * Why a change of a popover skips its transition, as `data-instant` reports it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PopoverInstant = "click" | "dismiss" | "focus" | "trigger-change"

const Hover = Schema.Struct({ delay: Schema.Number, closeDelay: Schema.Number })

type Hover = typeof Hover.Type

const PopoverMessage = UiSchema.TaggedEnum({
  RequestedOpenDialog: { triggerId: Schema.NullOr(Schema.String) },
  RequestedCloseDialog: { reason: DialogDismissReason },
  SettledDialog: { open: Schema.Boolean },
  EnteredTrigger: {
    triggerId: Schema.NullOr(Schema.String),
    ...Hover.fields,
    at: Schema.NullOr(Point),
    drawn: Schema.Boolean
  },
  LeftTrigger: { triggerId: Schema.NullOr(Schema.String), at: Schema.NullOr(Point) },
  PressedDetachedTrigger: { triggerId: Schema.NullOr(Schema.String), pointerType: Schema.String },
  LostTrigger: { triggerId: Schema.NullOr(Schema.String) },
  EnteredPositioner: {},
  LeftPositioner: {},
  CompletedWaitBeforeOpening: {},
  CompletedWaitBeforeClosing: {},
  CompletedWaitBeforeClosingOnPress: {},
  SwitchedTrigger: {},
  SettledSwitch: {},
  Closed: {},
  Reopened: {},
  ChangedViewport: { change: ViewportChange },
  ChangedPlacement: { placement: Positioning.Placement }
})

type PopoverMessage = typeof PopoverMessage.Type

const PopoverModel = Schema.Struct({
  onTrigger: Schema.Boolean,
  onPositioner: Schema.Boolean,
  hoverTrigger: Schema.NullOr(Schema.String),
  rest: Schema.NullOr(Schema.Struct({ triggerId: Schema.NullOr(Schema.String), ...Point.fields })),
  closeDelay: Schema.Number,
  reason: Schema.NullOr(PopoverOpenReason),
  stale: Schema.Boolean,
  patient: Schema.Boolean,
  trigger: Schema.NullOr(Schema.String),
  method: Schema.NullOr(DialogInteraction),
  closeReason: Schema.NullOr(PopoverDismissReason),
  switched: Schema.Boolean,
  transition: Schema.NullOr(ViewportTransition),
  placement: Schema.NullOr(Positioning.Placement)
})

type PopoverModel = typeof PopoverModel.Type

type PopoverUpdate = Component.Update<PopoverModel, PopoverMessage, PopoverEvents, PopoverProps>

const patience = 500

const hoverOf = (options: {
  readonly openOnHover?: boolean | undefined
  readonly delay?: number | undefined
  readonly closeDelay?: number | undefined
  readonly disabled?: boolean | undefined
}): Hover | null =>
  options.openOnHover === true && options.disabled !== true
    ? { delay: options.delay ?? 300, closeDelay: options.closeDelay ?? 0 }
    : null

const Trigger = Html.ref("PopoverTrigger", "button")

// A trigger the popover draws is checked once the wait is over: one removed or disabled meanwhile
// sent no `mouseleave`.
const WaitBeforeOpening = Command.make(
  "WaitBeforeOpening",
  { args: { delay: Schema.Number, drawn: Schema.NullOr(Schema.String) }, mode: "switch" },
  ({ delay, drawn }) =>
    Effect.gen(function*() {
      yield* Effect.sleep(Duration.millis(delay))
      if (drawn === null) return PopoverMessage.CompletedWaitBeforeOpening()
      const trigger = yield* Renderer.Refs.use((refs) => refs.lookup(Trigger.at(drawn)))
      return Option.exists(trigger, (node) => !node.disabled)
        ? PopoverMessage.CompletedWaitBeforeOpening()
        : PopoverMessage.LostTrigger({ triggerId: drawn })
    })
)

const WaitBeforeClosing = Command.make(
  "WaitBeforeClosing",
  { args: { delay: Schema.Number }, mode: "switch" },
  ({ delay }) => Effect.as(Effect.sleep(Duration.millis(delay)), PopoverMessage.CompletedWaitBeforeClosing())
)

const WaitBeforeClosingOnPress = Command.make(
  "WaitBeforeClosingOnPress",
  { args: {}, mode: "switch" },
  () => Effect.as(Effect.sleep(Duration.millis(patience)), PopoverMessage.CompletedWaitBeforeClosingOnPress())
)

const activeOf = (model: PopoverModel, props: PopoverProps): string | null => props.triggerId ?? model.trigger

const reasonOf = (model: PopoverModel, open: boolean): PopoverOpenReason | null =>
  open && model.stale ? null : model.reason

const hoverOpened = (model: PopoverModel, open: boolean): boolean => reasonOf(model, open) === "trigger-hover"

const openFor = (
  model: PopoverModel,
  $: PopoverUpdate,
  triggerId: string | null,
  reason: PopoverOpenReason,
  method: DialogInteraction | null = null
) =>
  $.set(model).evolve({
    reason,
    stale: false,
    patient: reason === "trigger-hover",
    trigger: triggerId,
    method,
    closeReason: null,
    onPositioner: $.props.open && model.onPositioner,
    switched: $.props.open && model.switched && triggerId === activeOf(model, $.props),
    transition: $.props.open ? model.transition : null
  }).run(
    Command.interrupt(WaitBeforeOpening),
    Command.interrupt(WaitBeforeClosing),
    reason === "trigger-hover" ? WaitBeforeClosingOnPress.make({}) : Command.interrupt(WaitBeforeClosingOnPress)
  ).emit(PopoverEvents.RequestedOpen({ triggerId, reason }))

const dismiss = ($: PopoverUpdate, reason: PopoverDismissReason) =>
  $.evolve({ closeReason: reason }).run(Command.interrupt(WaitBeforeClosing)).emit(
    PopoverEvents.RequestedClose({ reason })
  )

const pressed = (model: PopoverModel, $: PopoverUpdate) =>
  model.patient
    ? openFor(model, $, activeOf(model, $.props), "trigger-press", model.method)
    : dismiss($, "trigger-press")

const left = (next: PopoverModel, $: PopoverUpdate) => {
  if (!$.props.open) return next.onTrigger ? next : $.set(next).run(Command.interrupt(WaitBeforeOpening))
  return hoverOpened(next, true) && !next.onTrigger && !next.onPositioner
    ? $.set(next).run(WaitBeforeClosing.make({ delay: next.closeDelay }))
    : next
}

const detached = detachedChannel<PopoverMessage>("detachedTriggers")

const TrackDetachedTrigger = Mount.makeStream(
  "TrackDetachedTrigger",
  { args: { popupId: Schema.String, hover: Schema.NullOr(Hover) } },
  (node: HTMLButtonElement, args, changes) =>
    Stream.callback<never>(() => {
      let current = args
      const send = (message: PopoverMessage) => detached.send(node.ownerDocument, current.popupId, message)
      const triggerId = () => node.id === "" ? null : node.id
      let entered: { readonly triggerId: string | null } | null = null
      const lost = () => {
        if (entered !== null) send(PopoverMessage.LostTrigger(entered))
        entered = null
      }
      const controller = new AbortController()
      const { signal } = controller
      return Effect.acquireRelease(
        Effect.sync(() => {
          node.addEventListener("click", (event) => {
            if (node.disabled) return
            send(PopoverMessage.PressedDetachedTrigger({
              triggerId: triggerId(),
              pointerType: (event as PointerEvent).pointerType ?? (event.detail === 0 ? "" : "mouse")
            }))
          }, { signal })
          node.addEventListener("pointerenter", (event) => {
            if (current.hover === null || node.disabled || event.pointerType !== "mouse") return
            entered = { triggerId: triggerId() }
            send(PopoverMessage.EnteredTrigger({
              ...entered,
              ...current.hover,
              at: { x: event.clientX, y: event.clientY },
              drawn: false
            }))
          }, { signal })
          node.addEventListener("pointerleave", (event) => {
            if (current.hover === null || event.pointerType !== "mouse") return
            entered = null
            send(PopoverMessage.LeftTrigger({ triggerId: triggerId(), at: { x: event.clientX, y: event.clientY } }))
          }, { signal })
        }).pipe(
          Effect.tap(() =>
            Effect.forkScoped(Stream.runForEach(changes, (next) =>
              Effect.sync(() => {
                if (current.hover !== null && next.hover === null) lost()
                current = next
              })))
          )
        ),
        () =>
          Effect.sync(() => {
            controller.abort()
            lost()
          })
      )
    })
)

const TrackSwitch = Mount.makeStream(
  "TrackSwitch",
  { args: { open: Schema.Boolean, trigger: Schema.NullOr(Schema.String), positionerId: Schema.String } },
  (node: HTMLElement, args, changes) =>
    Stream.callback<PopoverMessage>((queue) => {
      const document = node.ownerDocument
      const frame = frameOf(document.defaultView)
      let current = args
      let generation = 0
      const settle = (mine: number) =>
        frame(() =>
          whenFinished(() => [document.getElementById(current.positionerId)], frame, () => mine === generation, () => {
            if (current.open) Queue.offerUnsafe(queue, PopoverMessage.SettledSwitch())
          })
        )
      const onChange = (next: typeof args) => {
        const previous = current
        current = next
        if (!next.open) generation++
        if (previous.open !== next.open) {
          Queue.offerUnsafe(queue, next.open ? PopoverMessage.Reopened() : PopoverMessage.Closed())
        }
        if (!next.open || !previous.open || previous.trigger === null || next.trigger === null) {
          return
        }
        if (next.trigger === previous.trigger) return
        Queue.offerUnsafe(queue, PopoverMessage.SwitchedTrigger())
        settle(++generation)
      }
      if (args.open) Queue.offerUnsafe(queue, PopoverMessage.Reopened())
      return Effect.acquireRelease(
        Effect.forkScoped(Stream.runForEach(changes, (next) => Effect.sync(() => onChange(next)))),
        () =>
          Effect.sync(() => {
            generation++
          })
      )
    })
)

/**
 * The options of a `PopoverTrigger`.
 *
 * **Details**
 *
 * - `open`: whether the popover is open for this trigger.
 * - `popupId`: the popover's `id`.
 * - `pressed`: whether the popover is open by a press, from `RequestedOpen`'s
 *   reason, for `data-pressed`.
 * - `disabled`: the trigger takes no press and no hover.
 * - `openOnHover`, `delay`, `closeDelay`: as on the `trigger` part.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PopoverTriggerProps {
  readonly open: boolean
  readonly popupId: string
  readonly pressed?: boolean | undefined
  readonly disabled?: boolean | undefined
  readonly openOnHover?: boolean | undefined
  readonly delay?: number | undefined
  readonly closeDelay?: number | undefined
}

/**
 * A button that opens a popover drawn somewhere else, such as in another
 * component. Call it with the caller's `h`, whether the popover is open for
 * this trigger and the popover's `id` as `popupId`, then chain the label.
 *
 * **Details**
 *
 * Its presses and hovers reach the popover with that `id` by themselves, so the
 * popover emits `RequestedOpen` and `RequestedClose` for them as for its own
 * `trigger` part, with this trigger's `id`. Give the trigger an `id` and pass
 * the one `RequestedOpen` reports as the popover's `triggerId`, so the popup is
 * placed against it. Nothing happens while no popover with that `id` is drawn.
 *
 * It sets the trigger's `type`, `aria-haspopup="dialog"`, `aria-expanded`,
 * `data-popup-open`, `aria-controls` while the popover is open,
 * `data-pressed`, `disabled` and `data-disabled`, in `forward`, so they win
 * over the caller's. It takes the element's mount, so the caller can't set
 * another one on it.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const PopoverTrigger = <Msg, R = never>(
  h: { readonly button: DialogTriggerElement<Msg> },
  options: {
    /** The caller's `h.button`, to stack a part on it. `h.button` when left out. */
    readonly element?: DialogTriggerElement<Msg, R> | undefined
    readonly props: PopoverTriggerProps
  }
): DialogTriggerElement<Msg, R> => {
  const { disabled, open, popupId, pressed } = options.props
  return DialogTrigger(h, { element: options.element, props: { open, popupId } })
    .forward((node) =>
      node
        .attrs({
          "data-pressed": flag(open && pressed === true),
          "data-disabled": flag(disabled),
          "aria-disabled": undefined
        })
        .disabled(disabled === true)
    )
    .onMount(TrackDetachedTrigger({ popupId, hover: hoverOf(options.props) }))
}

/**
 * A headless popover. Call it with the consumer's `h` and a `view` closure
 * that draws the trigger with `popover.trigger` and the popup with
 * `popover.portal` and the parts inside it.
 *
 * **Details**
 *
 * The parts also return plain values for markup that depends on them:
 * `open`, `mounted` (the popover shows, through its exit transition),
 * `transitionStatus`, `triggerId`, the `id` of the trigger the popover is
 * open for or last was, `openReason`, `openMethod` and `closeMethod`, `side`
 * and `align`, where the popup is, and `instant`.
 *
 * The `trigger` part takes `{ element, openOnHover, delay, closeDelay, disabled }`.
 * It reports the `id` the consumer gave the element in `RequestedOpen`, and
 * gives a trigger without one a generated `id`. Pressing the trigger the
 * popover is open for asks it to close, and pressing another one asks it to
 * open for that one.
 *
 * Each part's attributes win over the ones the consumer set on the builder
 * it passes in, including the ones a state leaves absent: on the trigger
 * `id`, `type`, `disabled`, `aria-haspopup`, `aria-expanded`, `aria-controls`,
 * `data-popup-open`, `data-pressed`, `data-disabled` and `data-dialog-trigger`;
 * on the portal `id`, `popover` and `open`; `role` and `id` on the
 * positioner; `id` and `aria-hidden` on the arrow; the data attributes on the
 * backdrop, positioner, popup, viewport and arrow; and what a `Dialog` owns on
 * the popup, title, description, close, `initialFocus` and `finalFocus` parts.
 * The viewport's children are drawn inside its `data-current` container.
 * The portal's box, the positioner's and the arrow's position and the
 * backdrop's `pointer-events` are added after the consumer's inline style. A
 * handler the consumer adds to a part runs after the popover's own.
 *
 * It emits `RequestedOpen`, `RequestedClose` and `Settled`.
 *
 * On the server and on a host that doesn't run mounts, the popover renders
 * closed, isn't placed and doesn't open on hover from a `PopoverTrigger`.
 *
 * History restore saves nothing of it: after Back, forward or a reload it
 * starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Popover = Component.define({
  name: "Popover",
  scoped: false,
  props: PopoverProps,
  model: PopoverModel,
  message: PopoverMessage,
  events: PopoverEvents,
  restore: false,
  elements: Html
}).make({
  init: () => ({
    onTrigger: false,
    onPositioner: false,
    hoverTrigger: null,
    rest: null,
    closeDelay: 0,
    reason: null,
    stale: false,
    patient: false,
    trigger: null,
    method: null,
    closeReason: null,
    switched: false,
    transition: null,
    placement: null
  }),
  update: {
    RequestedOpenDialog: (model, { triggerId }, $) => openFor(model, $, triggerId, "trigger-press"),
    RequestedCloseDialog: (model, { reason }, $) => {
      if (reason === "trigger-press") return pressed(model, $)
      if (reason === "focus-out" && hoverOpened(model, $.props.open)) return model
      return dismiss($, reason)
    },
    SettledDialog: (_model, { open }, $) =>
      $.evolve(open ? {} : { switched: false, transition: null }).emit(PopoverEvents.Settled({ open })),
    EnteredTrigger: (model, { at, closeDelay, delay, drawn, triggerId }, $) => {
      // A layer drawn over the trigger takes the pointer off it, and gives it back where it was once
      // it is gone. The pointer didn't move, so that is no hover.
      const uncovered = at !== null && model.rest !== null && model.rest.triggerId === triggerId &&
        at.x === model.rest.x && at.y === model.rest.y
      const next = UiStruct.evolve(model, { onTrigger: true, hoverTrigger: triggerId, closeDelay, rest: null })
      if (!$.props.open) {
        return uncovered
          ? next
          : $.set(next).run(WaitBeforeOpening.make({ delay, drawn: drawn ? triggerId : null }))
      }
      const active = activeOf(model, $.props)
      return uncovered || active === null || active === triggerId
        ? $.set(next).run(Command.interrupt(WaitBeforeClosing))
        : openFor(next, $, triggerId, "trigger-hover")
    },
    LeftTrigger: (model, { at, triggerId }, $) =>
      left(
        UiStruct.evolve(model, {
          onTrigger: false,
          hoverTrigger: null,
          rest: at === null ? null : { triggerId, ...at }
        }),
        $
      ),
    LostTrigger: (model, { triggerId }, $) =>
      model.onTrigger && model.hoverTrigger === triggerId
        ? left(UiStruct.evolve(model, { onTrigger: false, hoverTrigger: null, rest: null }), $)
        : model,
    PressedDetachedTrigger: (model, { pointerType, triggerId }, $) => {
      const active = activeOf(model, $.props)
      return $.props.open && (active === null || active === triggerId)
        ? pressed(model, $)
        : openFor(model, $, triggerId, "trigger-press", methodOf(pointerType))
    },
    EnteredPositioner: (_model, _message, $) =>
      $.evolve({ onPositioner: true }).run(Command.interrupt(WaitBeforeClosing)),
    LeftPositioner: (model, _message, $) => left(UiStruct.evolve(model, { onPositioner: false }), $),
    CompletedWaitBeforeOpening: (model, _message, $) =>
      !$.props.open && model.onTrigger ? openFor(model, $, model.hoverTrigger, "trigger-hover") : model,
    CompletedWaitBeforeClosing: (model, _message, $) =>
      $.props.open && hoverOpened(model, true) && !model.onTrigger && !model.onPositioner
        ? dismiss($, "trigger-hover")
        : model,
    CompletedWaitBeforeClosingOnPress: (_model, _message, $) => $.evolve({ patient: false }),
    SwitchedTrigger: (_model, _message, $) => $.evolve({ switched: false }),
    SettledSwitch: (model, _message, $) => $.props.open ? $.evolve({ switched: true }) : model,
    Closed: (_model, _message, $) => $.evolve({ stale: true, patient: false, method: null }),
    Reopened: (model, _message, $) => model.stale ? $.evolve({ reason: null, stale: false }) : model,
    ChangedViewport: (model, { change }, $) => stepViewport(model, change, $.props.open),
    ChangedPlacement: (_model, { placement }, $) => $.evolve({ placement })
  },
  subscriptions: (_model, props) => props.id === undefined ? [] : [detached.subscription(props.id)],
  parts: (model, p) => {
    const props = p.props
    const open = props.open
    const reason = reasonOf(model, open)
    const byHover = reason === "trigger-hover"
    const portalId = props.id ?? p.id("portal")
    const positionerId = p.id("positioner")
    const arrowId = p.id("arrow")
    const backdropKey = p.id("backdrop")
    const active = activeOf(model, props)
    const placement = model.placement
    const triggerSelector = active === null ? attrSelector("aria-controls", portalId) : idSelector(active)
    const tracked = Positioning.trackArgs(props, {
      side: "bottom",
      anchorSelector: triggerSelector,
      arrowId,
      offsetAsPadding: true
    })
    const side = placement?.side ?? tracked.options.side
    const align = placement?.align ?? tracked.options.align
    let triggers = 0

    const placed = <B extends Attributed<B>>(builder: B): B => builder.attrs({ "data-side": side, "data-align": align })
    const shown = <B extends Attributed<B>>(builder: B): B =>
      placed(builder).attrs({ "data-open": flag(open), "data-closed": flag(!open) })

    const triggerPart = p.part(
      "button",
      (b, key: string, hover: Hover | null, disabled: boolean) => {
        const button = b
          .attrs({
            "data-pressed": flag(open && active === key && reason === "trigger-press"),
            "data-disabled": flag(disabled),
            "aria-disabled": undefined
          })
          .disabled(disabled)
        return hover === null ? button : button
          .ref(Trigger.at(key))
          .on(
            "mouseenter",
            (payload: Partial<Html.HoverPayload>) =>
              PopoverMessage.EnteredTrigger({ triggerId: key, ...hover, at: pointOf(payload), drawn: true })
          )
          .on(
            "mouseleave",
            (payload: Partial<Html.HoverPayload>) =>
              PopoverMessage.LeftTrigger({ triggerId: key, at: pointOf(payload) })
          )
      }
    )
    const portalPart = p.part("dialog", (b) =>
      b.forward((node) =>
        tracked.positionMethod === "absolute"
          ? node.attr("style", withStyle(node.elementAttrs.style, atDocumentOrigin))
          : node
      ))
    const backdropPart = p.part(
      "div",
      (b) =>
        b.forward((node) =>
          byHover ? node.attr("style", withStyle(node.elementAttrs.style, "pointer-events:none")) : node
        )
    )
    const positionerStyle = Positioning.positionerStyle(tracked.positionMethod)
    const positioner = p.part("div", (b) => {
      const decorated = shown(b)
        .attrs({
          id: positionerId,
          role: "presentation",
          "data-anchor-hidden": flag(open && placement?.anchorHidden)
        })
        .on("mouseenter", PopoverMessage.EnteredPositioner())
        .on("mouseleave", PopoverMessage.LeftPositioner())
        .forward((node) => node.attr("style", withStyle(node.elementAttrs.style, positionerStyle)))
      return open
        ? decorated.onMount(
          Positioning.TrackPosition(tracked).pipe(
            Mount.map((placement) => PopoverMessage.ChangedPlacement({ placement }))
          )
        )
        : decorated
    })
    const arrowStyle = Positioning.arrowStyle(side)
    const arrow = p.part("div", (b) =>
      shown(b)
        .attrs({
          id: arrowId,
          "aria-hidden": "true",
          "data-uncentered": flag(placement?.arrowUncentered)
        })
        .forward((node) => node.attr("style", withStyle(node.elementAttrs.style, arrowStyle))))

    return p.child(Dialog, {
      props: {
        open,
        modal: byHover ? false : props.modal ?? false,
        nested: false,
        triggerId: active,
        keepMounted: props.keepMounted,
        initialFocus: byHover ? false : props.initialFocus,
        finalFocus: byHover ? false : props.finalFocus,
        id: portalId,
        openMethod: props.openMethod ?? model.method,
        holdExit: props.holdExit
      },
      onEmit: {
        RequestedOpen: ({ triggerId }) => PopoverMessage.RequestedOpenDialog({ triggerId }),
        RequestedClose: ({ reason }) => PopoverMessage.RequestedCloseDialog({ reason }),
        Settled: ({ open }) => PopoverMessage.SettledDialog({ open })
      },
      parts: (dialog) => {
        const instant: PopoverInstant | undefined = open
          ? model.switched
            ? "trigger-change"
            : reason === "trigger-press" && dialog.openMethod === "keyboard"
            ? "click"
            : undefined
          : model.closeReason === "escape-key"
          ? "dismiss"
          : model.closeReason === "focus-out"
          ? "focus"
          : model.closeReason === "trigger-press" && dialog.closeMethod === "keyboard"
          ? "click"
          : undefined
        const transitionStatus: DialogTransitionStatus = dialog.transitionStatus
        const transition = open ? model.transition : null
        const viewportPart = p.part("div", (b) => {
          const viewport = b
            .attrs({
              "data-activation-direction": transition?.direction ?? undefined,
              "data-transitioning": flag(transition !== null),
              "data-instant": instant
            })
            .forward((node) => viewportContent(node, active ?? "", transition))
          return dialog.mounted
            ? viewport.onMount(
              TrackViewport({
                open,
                trigger: triggerSelector,
                side,
                positionerId,
                transitioning: transition !== null
              }).pipe(Mount.map((change) => PopoverMessage.ChangedViewport({ change })))
            )
            : viewport
        })
        const popupPart = p.part("div", (b) => {
          const popup = placed(b).attr("data-instant", instant)
          return dialog.mounted
            ? popup.onMount(TrackSwitch({ open, trigger: active, positionerId }))
            : popup
        })
        return {
          open,
          mounted: dialog.mounted,
          transitionStatus,
          triggerId: dialog.triggerId,
          openReason: open ? reason : null,
          openMethod: dialog.openMethod,
          closeMethod: dialog.closeMethod,
          side,
          align,
          instant,
          trigger: View.wrapPart(
            triggerPart,
            <B extends View.PartTarget<"button">>(options: {
              /** The trigger's element. */
              readonly element: B
              /** Whether the mouse resting on the trigger opens the popover. */
              readonly openOnHover?: boolean | undefined
              /** Milliseconds the mouse rests on the trigger before the popover opens, 300 by default. */
              readonly delay?: number | undefined
              /** Milliseconds after the pointer leaves before a popover opened by hover closes, 0 by default. */
              readonly closeDelay?: number | undefined
              /** Whether the trigger takes no press and no hover. */
              readonly disabled?: boolean | undefined
            }): ReturnType<B["attr"]> => {
              const key = idOf(options.element) ?? p.id("trigger", triggers++)
              const disabled = options.disabled === true
              const element = options.element.attr("id", key)
              return triggerPart(
                dialog.trigger(disabled ? element.disabled(true) : element),
                key,
                hoverOf(options),
                disabled
              )
            }
          ),
          portal: <B extends View.PartTarget<"dialog">>(element: B) => dialog.portal(portalPart(element)),
          backdrop: <B extends Keyed<"div">>(element: B): ReturnType<B["attr"]> | undefined => {
            const out = dialog.backdrop(element.key(backdropKey))
            return out === undefined ? undefined : backdropPart(out)
          },
          positioner: View.wrapPart(
            positioner,
            <B extends Keyed<"div">>(element: B): ReturnType<B["attr"]> =>
              positioner(element.key(positionerId)).attr("data-instant", instant)
          ),
          popup: <B extends View.PartTarget<"div">>(element: B) => popupPart(dialog.popup(element)),
          arrow,
          viewport: viewportPart,
          title: dialog.title,
          description: dialog.description,
          close: dialog.close,
          initialFocus: dialog.initialFocus,
          finalFocus: dialog.finalFocus
        }
      }
    })
  }
})
