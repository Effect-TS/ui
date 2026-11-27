/**
 * Lets custom widgets share Dialog's dismissal stack. `TrackDismissal`
 * reports close requests; the consumer decides whether to close the widget.
 * Ignoring a request does not pass it to the layer below. Focus trapping and
 * focus return remain separate responsibilities.
 *
 * **Layer ordering**
 *
 * Mount `TrackDismissal` on the widget's element while it is visible. A
 * nested layer takes precedence over its ancestor; otherwise, the later
 * mount takes precedence. `Dialog`, `AlertDialog`, `Popover` and `Drawer`
 * share this stack. They claim every reason, even when configured to ignore
 * it, such as an outside press with `disablePointerDismissal`.
 * A modal dialog still traps Tab while a custom layer inside it is open.
 *
 * Each event selects the topmost layer that accepts its reason. Closing
 * that layer during the event does not pass the event to another layer.
 *
 * **Dismissal reasons**
 *
 * - `escape-key`: Escape, unless already prevented or an input method is
 *   composing. The selected layer prevents the key's default behavior.
 * - `outside-press`: a primary-button press outside the element. Mouse and
 *   pen presses request dismissal on pointerdown; touch waits for a click
 *   so scrolling does not dismiss. Scrollbars and toasts do not count.
 * - `focus-out`: focus moving outside the element. Focus moved by the kit
 *   or by a claimed outside press, through its click, does not request
 *   dismissal from any layer.
 * - `close-watcher`: Android's back gesture in browsers that support
 *   `CloseWatcher`.
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
import { isElement } from "./internal/dom.ts"
import { onScrollbar, trackComposing } from "./internal/interaction.ts"
import {
  claimPress,
  join,
  type Layer,
  rewatch,
  stackOf,
  topFor
} from "./internal/layers.ts"
import { inKept } from "./internal/topLayer.ts"

/**
 * Dismissal reasons shared with Dialog's `DialogDismissReason`.
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
 * Options for `TrackDismissal`.
 *
 * **Details**
 *
 * - `insideSelector`: elements outside the layer's element that count as
 *   inside it, such as its anchor, its trigger or a part drawn elsewhere:
 *   `[id="${anchorId}"]`.
 * - `reasons`: accepted reasons, defaulting to all four. Omitted reasons
 *   remain available to lower layers.
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
 * Returns a stream of close requests for `node`. Running the stream registers
 * the layer; stopping it removes the layer.
 *
 * **Details**
 *
 * An element accepts one mount. To combine dismissal with positioning, use
 * `Mount.makeStream` and merge this stream with `Positioning.trackPosition`.
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
      cancelled: () => send("close-watcher")
    }
    const top = (reason: Reason, event: Event) =>
      topFor(stack, reason, event) === layer
    // Shadow DOM retargets event.target to the host; the path includes inner nodes.
    const away = (event: Event): boolean => {
      const path = event.composedPath()
      if (event.target === null || path.includes(node)) return false
      if (inKept(event.target as Node)) return false
      const selector = current.insideSelector
      return !selector ||
        !path.some((target) => isElement(target) && target.matches(selector))
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" || event.defaultPrevented ||
        composing(event) || !top("escape-key", event)
      ) return
      event.preventDefault()
      send("escape-key")
    }
    const onPointerDown = (event: PointerEvent) => {
      const { pointerType, target } = event
      if (
        event.button !== 0 || !event.isPrimary ||
        !top("outside-press", event) || !away(event)
      ) return
      // Wait for a touch click so scrolling does not dismiss the layer.
      if (pointerType === "touch") {
        claimPress(stack, event, (click) => {
          if (top("outside-press", click) && away(click)) {
            send("outside-press", pointerType)
          }
        })
      } else if (!onScrollbar(target, event)) {
        claimPress(stack, event)
        send("outside-press", pointerType)
      }
    }
    // Focus that moves within a shadow root doesn't reach the document, so
    // the roots the layer is in listen too, and an event both hear counts once.
    let seen: Event | undefined
    const onFocusIn = (event: FocusEvent) => {
      if (event === seen) return
      seen = event
      if (top("focus-out", event) && away(event)) send("focus-out")
    }

    const controller = new AbortController()
    const { signal } = controller
    const composing = trackComposing(document, signal)
    return Effect.acquireRelease(
      Effect.sync(() => {
        document.addEventListener("keydown", onKeyDown, { signal })
        const capture = { capture: true, signal }
        document.addEventListener("pointerdown", onPointerDown, capture)
        document.addEventListener("focusin", onFocusIn, capture)
        let root = node.getRootNode()
        while ("host" in root) {
          root.addEventListener("focusin", onFocusIn as EventListener, capture)
          root = (root as ShadowRoot).host.getRootNode()
        }
        join(stack, layer, signal)
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
        Effect.sync(() => controller.abort())
    )
  })

/**
 * Registers its element in the dismissal stack for the mount's lifetime.
 * Map each emitted `Request` to a message so your update handler can decide
 * whether to close the widget.
 *
 * **Details**
 *
 * Argument updates apply from the next event. See the module documentation
 * for layer ordering and dismissal reasons.
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
