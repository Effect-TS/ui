/**
 * Lets a widget of the consumer's own, such as an inline editor or a
 * floating toolbar, join the stack of layers the kit's dialogs keep, so
 * Escape, a press outside, focus leaving it and Android's back gesture reach
 * only the topmost layer.
 *
 * A layer doesn't close by itself. `TrackDismissal` reports a `Request` with
 * the reason, and the consumer decides, as with a dialog's `RequestedClose`.
 * A refused request is still taken, so the layer below doesn't hear it.
 * Focus trapping and returning focus are not part of it.
 *
 * **Layers**
 *
 * Issue `TrackDismissal` on the widget's element while it shows: the
 * mount's lifetime is the layer's. A layer drawn inside another one's
 * element, such as an editor in a `Dialog`'s popup, is above it. Otherwise
 * the one mounted later is. `Dialog`, `AlertDialog`, `Popover` and
 * `Drawer` are layers too, and take every reason, also one they ignore,
 * such as a press outside with `disablePointerDismissal`. A modal dialog
 * keeps Tab inside it while a layer in it is open.
 *
 * Each event goes to the topmost layer that takes its reason, decided as the
 * event starts, so a layer that closes on it doesn't hand it on to the layer
 * below.
 *
 * **Reasons**
 *
 * - `escape-key`: Escape, wherever focus is, unless something already
 *   cancelled it with `preventDefault` or an input method is composing. The
 *   layer cancels it.
 * - `outside-press`: a press with the main button outside the element. A
 *   mouse or a pen counts as it presses, a finger on the tap's click, so a
 *   scroll doesn't count. Neither does a press on a scrollbar or a toast.
 * - `focus-out`: focus moving to an element outside, unless a press outside
 *   that the layer takes moved it, or the kit did, such as a dialog opening.
 * - `close-watcher`: Android's back gesture, in a browser with
 *   `CloseWatcher` such as Chrome.
 *
 * **Example** (An inline editor that keeps unsaved changes)
 *
 * ```ts import.meta.vitest
 * import { Mount, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Dismissal } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const NoteMessage = UiSchema.TaggedEnum({
 *   RequestedDismiss: { request: Dismissal.Request }
 * })
 *
 * const Note = Html.component({
 *   name: "Note",
 *   model: Schema.Struct({ editing: Schema.Boolean, dirty: Schema.Boolean }),
 *   message: NoteMessage
 * }).make({
 *   init: () => ({ editing: true, dirty: false }),
 *   update: {
 *     // Refuse while there are unsaved changes: the layer below still doesn't hear it.
 *     RequestedDismiss: ($) => $.model.dirty ? $.model : $.evolve({ editing: false })
 *   },
 *   view: (h, model) =>
 *     h.div(
 *       h.button.attr("id", "edit").children("Edit"),
 *       model.editing
 *         ? h.div.class("editor").onMount(
 *           Dismissal.TrackDismissal({ insideSelector: "#edit", reasons: ["escape-key", "outside-press"] }).pipe(
 *             Mount.map((request) => NoteMessage.RequestedDismiss({ request }))
 *           )
 *         ).children(h.input)
 *         : null
 *     )
 * })
 *
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Note, {}))
 * if (!html.includes("class=\"editor\"")) throw new Error("the editor isn't drawn")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Mount from "@effect/ui/Mount"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { elementOf } from "./internal/dom.ts"
import { onScrollbar, trackComposing } from "./internal/interaction.ts"
import {
  handingOff,
  join,
  type Layer,
  rewatch,
  stackOf,
  topFor,
  watcherOf
} from "./internal/layers.ts"
import { inKept } from "./internal/topLayer.ts"

/**
 * Why a layer is asked to close: Escape, a press outside, focus leaving it,
 * or a close request from the browser, such as Android's back gesture. The
 * same names as a dialog's `DialogDismissReason`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Reason = Schema.Literals([
  "escape-key",
  "outside-press",
  "focus-out",
  "close-watcher"
])

/**
 * Why a layer is asked to close.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Reason = typeof Reason.Type

/**
 * A request to close a layer: the reason, and the press's pointer type for
 * `outside-press`, `""` otherwise.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Request = Schema.Struct({
  reason: Reason,
  pointerType: Schema.String
})

/**
 * A request to close a layer.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Request = typeof Request.Type

/**
 * The args of `TrackDismissal`.
 *
 * **Details**
 *
 * - `insideSelector`: elements outside the layer's element that count as
 *   inside it, such as its anchor, its trigger or a part drawn elsewhere:
 *   `[id="${anchorId}"]`.
 * - `reasons`: the reasons the layer takes, all four when left out. A
 *   reason left out isn't listened for, and reaches the layer below.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const TrackDismissalArgs = Schema.Struct({
  insideSelector: Schema.optional(Schema.String),
  reasons: Schema.optional(Schema.Array(Reason))
})

/**
 * The args of `TrackDismissal`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type TrackDismissalArgs = typeof TrackDismissalArgs.Type

/**
 * The body of `TrackDismissal`: the Stream of a layer's `Request`s, which
 * keeps the layer in the stack as it runs.
 *
 * **Details**
 *
 * An element takes one mount. To do more on the layer's element, such as
 * place it with `Positioning.trackPosition`, pass `Mount.makeStream` a body
 * that merges this Stream with its own. The arguments are the ones a body
 * gets: the node, the args and the Stream of later args.
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export const trackDismissal = (
  node: HTMLElement,
  args: TrackDismissalArgs = {},
  changes: Stream.Stream<TrackDismissalArgs> = Stream.empty
): Stream.Stream<Request> =>
  Stream.callback<Request>((queue) => {
    const document = node.ownerDocument
    const stack = stackOf(document)
    let current = args
    const send = (reason: Reason, pointerType = "") =>
      Queue.offerUnsafe(queue, { reason, pointerType })
    const layer: Layer = {
      node,
      open: () => true,
      takes: (claim) =>
        (current.reasons ?? Reason.literals).includes(claim as Reason),
      watch: watcherOf(stack, document.defaultView, () => send("close-watcher"))
    }
    const top = (reason: Reason, event: Event) =>
      topFor(stack, reason, event) === layer
    const away = (target: EventTarget | null): target is Node => {
      if (
        target === null || node.contains(target as Node) ||
        inKept(target as Node)
      ) return false
      const selector = current.insideSelector
      return !selector || elementOf(target)?.closest(selector) == null
    }
    // The pointer type of a press outside the layer took, until its click.
    let pressed: string | undefined

    const onKeyDown = (event: KeyboardEvent) => {
      pressed = undefined
      if (
        event.key !== "Escape" || event.defaultPrevented ||
        composing(event) || !top("escape-key", event)
      ) return
      event.preventDefault()
      send("escape-key")
    }
    const onPointerDown = (event: PointerEvent) => {
      pressed = undefined
      const { target } = event
      if (
        event.button !== 0 || !event.isPrimary || !away(target) ||
        !top("outside-press", event)
      ) return
      if (event.pointerType === "touch") pressed = "touch"
      else if (!onScrollbar(target, event)) {
        pressed = event.pointerType
        send("outside-press", pressed)
      }
    }
    const onClick = (event: MouseEvent) => {
      const touch = pressed === "touch"
      pressed = undefined
      if (touch && away(event.target) && top("outside-press", event)) {
        send("outside-press", "touch")
      }
    }
    const onFocusIn = (event: FocusEvent) => {
      if (
        pressed === undefined && !handingOff() && away(event.target) &&
        top("focus-out", event)
      ) send("focus-out")
    }

    const controller = new AbortController()
    const { signal } = controller
    const composing = trackComposing(document, signal)
    let leave = () => {}
    return Effect.acquireRelease(
      Effect.sync(() => {
        document.addEventListener("keydown", onKeyDown, { signal })
        const capture = { capture: true, signal }
        document.addEventListener("pointerdown", onPointerDown, capture)
        document.addEventListener("click", onClick, capture)
        document.addEventListener("focusin", onFocusIn, capture)
        leave = join(stack, layer)
      }).pipe(
        Effect.tap(() =>
          Effect.forkScoped(Stream.runForEach(changes, (next) =>
            Effect.sync(() => {
              current = next
              rewatch(stack)
            })))
        )
      ),
      () =>
        Effect.sync(() => {
          controller.abort()
          leave()
        })
    )
  })

/**
 * A stream mount that keeps its element in the stack of layers while it
 * runs, and reports each `Request` to close it. Issue it on the element
 * while the widget shows, and map each `Request` to a message.
 *
 * **Details**
 *
 * The module's JSDoc says which layer hears what. The args can change while
 * it runs, and a reason added or left out applies from the next event.
 *
 * A `Scene` has no document, so send a `Request` there with
 * `mounted(Dismissal.TrackDismissal, request)`.
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export const TrackDismissal = Mount.makeStream("TrackDismissal", {
  args: TrackDismissalArgs
}, trackDismissal)
