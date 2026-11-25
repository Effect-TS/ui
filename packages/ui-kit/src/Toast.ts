/**
 * A stack of short notifications that the app posts to and that leave on
 * their own after a timeout.
 *
 * `ToastProvider` is headless: it keeps the toast list in its own Model, owns
 * the timers, the stacking variables, the data attributes and the ARIA, and
 * the consumer draws the markup. The list is the provider's and not a prop,
 * because a closing toast stays on screen with its content until its exit
 * transition ends, after the app has stopped caring about it.
 *
 * Any `update` below the provider adds, updates and closes toasts by
 * sending requests to it with `$.send(ToastProvider, message)`:
 *
 * - `{ _tag: "RequestedAdd", toast }` shows `toast`. The sender picks its `id`,
 *   so it can update or close it later. A toast with an `id` that already
 *   shows is replaced, and its timer starts again.
 * - `{ _tag: "RequestedUpdate", id, ...changes }` changes the fields it names
 *   on a toast that shows. A toast that has closed stays closed.
 * - `{ _tag: "RequestedClose", id }` closes a toast.
 *
 * When the user closes a toast, with the close part, Escape or its timeout,
 * the provider emits `Dismissed` with its `id`.
 *
 * A toast that is loading, then done, is a `RequestedAdd` with
 * `type: "loading"` when the work starts, and a `RequestedUpdate` with the
 * same `id` when its result arrives. A loading toast never times out.
 *
 * **Anatomy**
 *
 * | Part          | Element                                         |
 * | :------------ | :---------------------------------------------- |
 * | `viewport`    | `<div>`, the landmark region that holds the toasts |
 * | `root`        | `<div>`, one toast                                 |
 * | `content`     | `<div>` inside the root, for the visible content   |
 * | `title`       | any element, the toast's label                  |
 * | `description` | any element, the toast's description            |
 * | `action`      | `<button>` for the consumer's own action           |
 * | `close`       | `<button>` that closes the toast                   |
 *
 * `viewport` takes the consumer's builder. Every other part takes
 * `{ element, toast }`, with a toast from the parts' `toasts`, and returns
 * the builder for the consumer to chain on and fill:
 * `toastProvider.title({ element: h.strong, toast }).children(toast.title)`. `root` sets
 * the element's key to the toast's `id`, so a toast keeps its element as
 * the list changes. The viewport adds, after the consumer's children, a
 * visually hidden alert for each high-priority toast.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except `data-type`, which
 * holds the toast's `type`:
 *
 * - `viewport`: `data-expanded`
 * - `root`: `data-expanded`, `data-limited`, `data-type`,
 *   `data-starting-style`, `data-ending-style`
 * - `content`: `data-expanded`, `data-behind`
 * - `title`, `description`, `action`, `close`: `data-type`
 *
 * The stack is expanded while the pointer is on the viewport or keyboard
 * focus is in it. `data-behind` marks the content of every toast but the
 * front one. `data-limited` marks a toast past the provider's `limit`,
 * which is also `inert`.
 *
 * `root` sets `--toast-index`, the toast's place from the front,
 * `--toast-offset-y`, the height of the toasts in front of it, and
 * `--toast-height`, its own height, once measured. `viewport` sets
 * `--toast-frontmost-height`. They are added after the consumer's inline
 * style.
 *
 * **Keyboard**
 *
 * F6 moves focus into the viewport while it holds a toast, and F6 again,
 * Shift+Tab or Escape from the viewport returns it to where it was. Tab moves
 * through the toasts, which are focusable, and their buttons. Escape closes
 * the toast that has focus. When a focused toast closes, or focus lands on a
 * closing one, focus moves to the next toast, else back to where it was
 * before it entered the viewport, by F6, Tab or a press. Failing both, focus
 * leaves the viewport, so the stack collapses.
 *
 * **Timers**
 *
 * A toast closes after its `timeout`, or the provider's, 5000 ms by
 * default. `0` and `type: "loading"` turn it off. Every timer pauses
 * while the stack is expanded or the window doesn't have focus, and starts
 * again from the full timeout when it resumes. A toast added while paused
 * waits for the resume.
 *
 * **Layering**
 *
 * The viewport is a manual popover, shown while the provider is drawn, so
 * it sits in the top layer above the page. When a `Dialog` shows, the
 * viewport shows itself again to stay in front of it, so its toasts can be
 * pressed while a modal is open. `z-index` on the viewport has no effect.
 *
 * The browser gives a popover its own box: `position: fixed`, `inset: 0`,
 * `margin: auto`, a border, padding, `overflow: auto` and the `Canvas`
 * colors. The viewport keeps that box, so its CSS places it, for example
 * `inset: auto 1rem 1rem auto; margin: 0; border: 0; padding: 0;
 * background: none; overflow: visible`.
 *
 * **Limits**
 *
 * Toasts anchored to another element, swiping a toast
 * away, and adding a toast from outside the component tree aren't
 * supported. Code outside the tree reaches the app through a Command result,
 * whose `update` can send to the provider.
 *
 * **Example** (A save button that shows a toast)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { ToastProvider } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const EditorMessage = UiSchema.TaggedEnum({ ClickedSave: {} })
 *
 * // Any component below the provider can send to it.
 * const Editor = Html.component({
 *   name: "Editor",
 *   model: Schema.Null,
 *   message: EditorMessage
 * }).make({
 *   init: () => null,
 *   update: {
 *     ClickedSave: ($) =>
 *       $.send(ToastProvider, {
 *         _tag: "RequestedAdd",
 *         toast: { id: "saved", title: "Saved", type: "success" }
 *       })
 *   },
 *   view: (h) => h.button.on("click", EditorMessage.ClickedSave()).children("Save")
 * })
 *
 * const App = Html.component({
 *   name: "App",
 *   model: Schema.Null,
 *   message: Schema.Never
 * }).make({
 *   init: () => null,
 *   update: ($) => $.model,
 *   view: (h) =>
 *     ToastProvider(h, {
 *       view: (toastProvider) =>
 *         h.div(
 *           Editor(h, {}),
 *           toastProvider.viewport(h.div.class("toasts")).children(
 *             toastProvider.toasts.map((toast) =>
 *               toastProvider.root({ element: h.div.class("toast"), toast }).children(
 *                 toastProvider.title({ element: h.strong, toast }).children(toast.title),
 *                 toastProvider.close({ element: h.button, toast }).children("Dismiss")
 *               )
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * // The viewport is a polite live region, there before any toast.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(App, {}))
 * if (!/<div class="toasts"[^>]* aria-live="polite"/.test(html)) throw new Error("the viewport isn't a live region")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import type * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as HtmlSubscription from "@effect/ui/html/HtmlSubscription"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as UiStruct from "@effect/ui/UiStruct"
import * as View from "@effect/ui/View"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import {
  attrSelector,
  flag,
  visuallyHidden,
  withStyle
} from "./internal/attributes.ts"
import { activeOf, focusVisible } from "./internal/dom.ts"
import { keepOnTop } from "./internal/topLayer.ts"

/**
 * The content of a toast, as a sender posts it in `RequestedAdd`.
 *
 * **Details**
 *
 * - `id`: required, and picked by the sender, so a later `RequestedUpdate`
 *   or `RequestedClose` can name the toast. Build it from domain data, such
 *   as `save-${note.id}`.
 * - `title` and `description`: the text the consumer draws, and the
 *   toast's accessible name and description.
 * - `type`: any string, shown as `data-type` on the parts, for the
 *   consumer's styles and icons. `"loading"` never times out.
 * - `timeout`: milliseconds before the toast closes on its own, the
 *   provider's `timeout` by default. `0` keeps it until it's closed.
 * - `priority`: `"high"` announces the toast at once, as an alert, and
 *   makes the root an `alertdialog`. `"low"`, the default, waits for the
 *   screen reader to be idle.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ToastData = Schema.Struct({
  id: Schema.String,
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  timeout: Schema.optional(Schema.Number),
  priority: Schema.optional(Schema.Literals(["low", "high"]))
})

/**
 * The content of a toast, as a sender posts it in `RequestedAdd`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ToastData = typeof ToastData.Type

/**
 * A toast as the parts' `toasts` list it: its content, with where it is in
 * its life.
 *
 * **Details**
 *
 * - `transitionStatus`: `"starting"` until the toast is measured after it
 *   first renders, `"ending"` from when it closes until its exit transition
 *   ends, and `undefined` in between.
 * - `limited`: the toast is past the provider's `limit`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ToastItem extends ToastData {
  readonly transitionStatus: "starting" | "ending" | undefined
  readonly limited: boolean
}

/**
 * The props of a `ToastProvider`.
 *
 * **Details**
 *
 * - `timeout`: milliseconds before a toast without its own `timeout` closes,
 *   5000 by default. `0` keeps toasts until they're closed.
 * - `limit`: how many toasts show at once, 3 by default. The older ones
 *   stay in the list, marked `limited` and `inert`, until newer ones close.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ToastProviderProps = Schema.Struct({
  timeout: Schema.optional(Schema.Number),
  limit: Schema.optional(Schema.Number)
})

/**
 * The props of a `ToastProvider`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ToastProviderProps = typeof ToastProviderProps.Type

/**
 * `Dismissed` reports that the user closed the toast `id`, with its close
 * part or Escape, or that its timeout ran out. A `RequestedClose` sent to the
 * provider emits nothing. Handling it is optional.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ToastProviderEvents = UiSchema.TaggedEnum({
  Dismissed: { id: Schema.String }
})

/**
 * What a `ToastProvider` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ToastProviderEvents = typeof ToastProviderEvents.Type

// The first three are what senders post. The rest are facts from the parts,
// the viewport's and the toasts' mounts, and the timers.
const ToastProviderMessage = UiSchema.TaggedEnum({
  RequestedAdd: { toast: ToastData },
  // Every field but `id` is optional, so a toast's fields are also a change's.
  RequestedUpdate: ToastData.fields,
  RequestedClose: { id: Schema.String },
  ClickedClose: { id: Schema.String },
  PressedEscape: { id: Schema.String },
  EnteredViewport: {},
  LeftViewport: {},
  FocusedViewport: {},
  BlurredViewport: {},
  FocusedWindow: {},
  BlurredWindow: {},
  MeasuredToast: { id: Schema.String, height: Schema.Number },
  FinishedExit: { id: Schema.String },
  CompletedWaitBeforeDismissal: { id: Schema.String }
})

type ToastProviderMessage = typeof ToastProviderMessage.Type

// A toast in the Model: its content, where it is in its life, and its
// natural height, 0 until measured and once it closes.
const Entry = Schema.Struct({
  ...ToastData.fields,
  transition: Schema.Literals(["starting", "shown", "ending"]),
  height: Schema.Number
})

type Entry = typeof Entry.Type

// Newest first. `hovering`: the pointer is on the viewport. `focused`:
// keyboard focus is in it. `windowFocused`: the window has focus. The
// timers run only while all three allow it.
const ToastProviderModel = Schema.Struct({
  toasts: Schema.Array(Entry),
  hovering: Schema.Boolean,
  focused: Schema.Boolean,
  windowFocused: Schema.Boolean
})

type ToastProviderModel = typeof ToastProviderModel.Type

// One run per toast: a new run for a toast replaces its running one, and a
// pause interrupts them all, so a cut wait sends nothing.
const WaitBeforeDismissal = Command.make(
  "WaitBeforeDismissal",
  {
    args: { id: Schema.String, timeout: Schema.Number },
    mode: "switch",
    group: ["id"]
  },
  ({ id, timeout }) =>
    Effect.as(
      Effect.sleep(Duration.millis(timeout)),
      ToastProviderMessage.CompletedWaitBeforeDismissal({ id })
    )
)

type Tracked = { readonly _tag: "Measured"; readonly height: number } | {
  readonly _tag: "Finished"
}

// A toast's natural height, again whenever its size or content changes.
const heights = (node: HTMLElement) =>
  Stream.callback<Tracked>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        let last = -1
        // The height the toast would have without the consumer's stacking
        // styles, which may clamp it.
        const measure = () => {
          const previous = node.style.height
          node.style.height = "auto"
          const height = node.offsetHeight
          node.style.height = previous
          if (height === last) return
          last = height
          Queue.offerUnsafe(queue, { _tag: "Measured", height })
        }
        const resize = typeof ResizeObserver === "function"
          ? new ResizeObserver(measure)
          : undefined
        const mutation = new MutationObserver(measure)
        resize?.observe(node)
        mutation.observe(node, {
          childList: true,
          subtree: true,
          characterData: true
        })
        measure()
        return () => {
          resize?.disconnect()
          mutation.disconnect()
        }
      }),
      (disconnect) => Effect.sync(disconnect)
    )
  )

// Once the transitions the ending style starts have run. Without any, at
// once.
const exited = (node: HTMLElement) =>
  Stream.fromEffect(Effect.promise(async (): Promise<Tracked> => {
    await new Promise(requestAnimationFrame)
    const animations = typeof node.getAnimations === "function"
      ? node.getAnimations()
      : []
    await Promise.allSettled(animations.map((animation) => animation.finished))
    return { _tag: "Finished" }
  }))

// Measures a toast until it closes, then reports when its exit transition
// has finished. `ending` follows the toast, so one added again while it's
// ending is measured again, and its cut wait reports nothing. `id` names
// the toast in the log.
const TrackToast = Mount.makeStream(
  "TrackToast",
  { args: { id: Schema.String, ending: Schema.Boolean } },
  (node: HTMLElement, _args, changes) =>
    Stream.switchMap(
      changes,
      ({ ending }) => (ending ? exited(node) : heights(node))
    )
)

type ViewportFact = "FocusedViewport" | "BlurredViewport" | "LeftViewport"

// Marks a provider's toast roots with its id, so a dialog of the consumer's
// inside a toast, or another provider's toast, isn't taken for one.
const rootAttr = "data-toast-root"

// What the viewport needs from its document: F6 into the viewport and back,
// keyboard focus inside it, a pointer that left while the toast under it was
// removed, and focus that a closing toast left with nowhere to stay. `empty`:
// no toast shows, so F6 is the page's. `hovering`: what the Model believes
// about the pointer.
const TrackViewport = Mount.makeStream(
  "TrackViewport",
  {
    args: {
      id: Schema.String,
      empty: Schema.Boolean,
      hovering: Schema.Boolean
    }
  },
  (node: HTMLElement, args, changes) =>
    Stream.callback<ViewportFact>((queue) =>
      Effect.gen(function*() {
        const document = node.ownerDocument
        let { empty, hovering } = args
        let focused = false
        const toastRoot = attrSelector(rootAttr, args.id)
        // The roots that can take focus: not closing, not limited.
        const focusable = `${toastRoot}:not([data-ending-style]):not([inert])`
        // The toast root that holds `element`, if it's closing.
        const closingRoot = (element: Element) => {
          const root = element.closest(toastRoot)
          return root?.hasAttribute("data-ending-style") ? root : null
        }
        // The active element of the viewport's own root, so a focused
        // control in a shadow root inside a toast counts as inside.
        const root = node.getRootNode() as Document | ShadowRoot
        const active = () => root.activeElement
        const inside = () => node.contains(active())
        // The focused element, as deep as it can be seen from the viewport's
        // root, which may be a closed shadow root.
        const focusedElement = () =>
          (activeOf(root) ?? activeOf(document)) as HTMLElement | null
        // Where focus was before it entered the viewport, by F6, Tab or a
        // press, while it's still in the page.
        let previous: HTMLElement | null = null
        const restore = (): boolean => {
          if (previous === null || !previous.isConnected) return false
          if (previous === document.body) {
            focusedElement()?.blur()
          } else previous.focus({ preventScroll: true })
          const restored = !inside()
          if (restored) previous = null
          return restored
        }
        // Back to where focus was, else out of the viewport, so the stack
        // collapses.
        const leave = () => {
          if (!restore()) focusedElement()?.blur()
        }
        // Whether `b` comes after `a` in the document.
        const follows = (a: Node, b: Node) =>
          (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) > 0
        // Focus moves off a closing toast. Focus that entered it by Tab, or
        // by Shift+Tab when `back`, goes to the next toast that way, and
        // leaves the viewport when there's none, so it can't loop. Focus that
        // was on it already, with `back` unset, goes to the toast after it,
        // else the one before.
        const passOn = (closing: Node, back?: boolean) => {
          const roots = Array.from(
            node.querySelectorAll<HTMLElement>(focusable)
          )
          // `closing` isn't one of them, so they split around it.
          const split = roots.findIndex((root) => follows(closing, root))
          const at = split === -1 ? roots.length : split
          const after = roots[at]
          const before = roots[at - 1]
          const next = back === undefined
            ? after ?? before
            : back
            ? before
            : after
          if (next === undefined) leave()
          else next.focus()
        }
        const onKeyDown = (event: KeyboardEvent) => {
          if (event.defaultPrevented) return
          if (event.key === "F6") {
            if (inside()) {
              if (restore()) event.preventDefault()
            } else if (!empty) {
              event.preventDefault()
              previous = focusedElement()
              node.focus(
                { preventScroll: true, focusVisible: true } as FocusOptions
              )
            }
          } else if (active() === node) {
            // Not `event.target`, which is the host when the viewport is in
            // a closed shadow root.
            if (event.key === "Escape") {
              leave()
              event.preventDefault()
            } else if (event.key === "Tab" && event.shiftKey && restore()) {
              event.preventDefault()
            }
          }
        }
        // Only keyboard focus expands the stack, so a click on a toast
        // doesn't hold it open after the pointer leaves. Focus that lands on
        // a closing toast, by Tab or a press, moves on, the way it came.
        const onFocusIn = (event: FocusEvent) => {
          const from = event.relatedTarget as HTMLElement | null
          if (
            previous === null && from !== null && !node.contains(from)
          ) previous = from
          const closing = closingRoot(event.target as Element)
          if (closing !== null) {
            return passOn(closing, from !== null && follows(closing, from))
          }
          if (focused || !focusVisible(event.composedPath()[0] as Element)) {
            return
          }
          focused = true
          Queue.offerUnsafe(queue, "FocusedViewport")
        }
        const onFocusOut = (event: FocusEvent) => {
          if (node.contains(event.relatedTarget as Node | null)) return
          previous = null
          if (!focused) return
          focused = false
          Queue.offerUnsafe(queue, "BlurredViewport")
        }
        // A toast removed under the pointer sends no mouseleave.
        const onMouseOver = (event: MouseEvent) => {
          if (hovering && !event.composedPath().includes(node)) {
            hovering = false
            Queue.offerUnsafe(queue, "LeftViewport")
          }
        }
        // Focus never stays on a toast that closes, nor in a viewport with no
        // toast to take it. It moves to the next toast. With none left, it
        // goes back to where it was before it entered the viewport, or else
        // it's blurred, so the stack collapses and the timers of later toasts
        // run.
        const handOff = (records: ReadonlyArray<MutationRecord>) => {
          const focus = active()
          if (!node.contains(focus)) return
          const closing = records.some(({ target }) => target.contains(focus))
            ? closingRoot(focus!)
            : null
          if (closing !== null) passOn(closing)
          else if (node.querySelector(focusable) === null) leave()
        }
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const unkeep = keepOnTop(node)
            const observer = new MutationObserver(handOff)
            observer.observe(node, {
              subtree: true,
              attributes: true,
              attributeFilter: ["data-ending-style"]
            })
            const controller = new AbortController()
            const { signal } = controller
            document.addEventListener("keydown", onKeyDown, { signal })
            document.addEventListener("mouseover", onMouseOver, {
              capture: true,
              signal
            })
            node.addEventListener("focusin", onFocusIn, { signal })
            node.addEventListener("focusout", onFocusOut, { signal })
            return () => {
              unkeep()
              observer.disconnect()
              controller.abort()
            }
          }),
          (remove) => Effect.sync(remove)
        )
        yield* Stream.runForEach(changes, (next) =>
          Effect.sync(() => {
            empty = next.empty
            hovering = next.hovering
          })).pipe(Effect.forkScoped)
      })
    )
)

// The window's focus, since the timers pause while it's elsewhere.
const windowFocus = [
  HtmlSubscription.onWindow("focus", ToastProviderMessage.FocusedWindow()),
  HtmlSubscription.onWindow("blur", ToastProviderMessage.BlurredWindow())
]

// The stack is expanded while the pointer is on it or keyboard focus is in it.
const expandedBy = (model: ToastProviderModel): boolean =>
  model.hovering || model.focused

// The timers run while the stack is collapsed and the window has focus.
const pausedBy = (model: ToastProviderModel): boolean =>
  expandedBy(model) || !model.windowFocused

const timeoutOf = (toast: ToastData, props: ToastProviderProps): number =>
  toast.timeout ?? props.timeout ?? 5000

// A toast that should be counting down, paused or not.
const timed = (entry: Entry, props: ToastProviderProps): boolean =>
  entry.transition !== "ending" && entry.type !== "loading" &&
  timeoutOf(entry, props) > 0

const wait = (entry: Entry, props: ToastProviderProps) =>
  WaitBeforeDismissal.make({ id: entry.id, timeout: timeoutOf(entry, props) })

const stop = (id: string) => Command.interrupt(WaitBeforeDismissal, { id })

// Where each toast sits in the stack: its index from the front, the height
// of the toasts in front of it, its own height, and whether it's past the
// limit. A closing toast keeps its place in the list but leaves the count.
const stackOf = (toasts: ReadonlyArray<Entry>, limit: number) => {
  const stack = new Map<
    string,
    {
      readonly index: number
      readonly offset: number
      readonly height: number
      readonly limited: boolean
    }
  >()
  let visible = 0
  let offset = 0
  toasts.forEach((toast, index) => {
    const ending = toast.transition === "ending"
    const limited = !ending && visible >= limit
    stack.set(toast.id, {
      index: ending ? index : visible,
      offset,
      height: toast.height,
      limited
    })
    offset += toast.height
    if (!ending) visible += 1
  })
  return stack
}

// `$` in any handler of the provider's `update`: a tag's `$` fits the one
// over the whole message type.
type ProviderUpdate = Component.Update<
  ToastProviderModel,
  ToastProviderMessage,
  ToastProviderEvents,
  ToastProviderProps
>

// The toast `id` while it shows. A closing one only waits for its exit.
const shown = (model: ToastProviderModel, id: string) =>
  model.toasts.find((toast) => toast.id === id && toast.transition !== "ending")

const replace = (model: ToastProviderModel, entry: Entry) =>
  model.toasts.map((toast) => (toast.id === entry.id ? entry : toast))

// Start a toast's timer, unless the timers are paused, or stop it.
const timer = ($: ProviderUpdate, entry: Entry) =>
  timed(entry, $.props)
    ? (pausedBy($.model) ? [] : [wait(entry, $.props)])
    : [stop(entry.id)]

// Move to `next`, pausing every timer or starting them again when the pause
// changes.
const settle = ($: ProviderUpdate, next: ToastProviderModel) => {
  const step = $.set(next)
  const paused = pausedBy($.model)
  if (!paused && pausedBy(next)) {
    return step.run(Command.interrupt(WaitBeforeDismissal))
  }
  if (paused && !pausedBy(next)) {
    return step.run(
      ...next.toasts.filter((toast) => timed(toast, $.props)).map((toast) =>
        wait(toast, $.props)
      )
    )
  }
  return step
}

// A toast that shows starts closing. Once none shows, the pointer is taken
// to have left, since a viewport that empties sends no mouseleave.
const close = ($: ProviderUpdate, id: string, user: boolean) => {
  const entry = shown($.model, id)
  if (entry === undefined) return $.model
  const toasts = replace(
    $.model,
    UiStruct.evolve(entry, { transition: "ending", height: 0 })
  )
  const showing = toasts.some((toast) => toast.transition !== "ending")
  const step = settle(
    $,
    UiStruct.evolve($.model, { toasts, hovering: showing && $.model.hovering })
  ).run(stop(id))
  return user ? step.emit(ToastProviderEvents.Dismissed({ id })) : step
}

// The user closed the toast, with the close part or Escape, or its timeout
// ran out.
const dismiss = ($: ProviderUpdate, { id }: { readonly id: string }) =>
  close($, id, true)

// A part that takes the toast it draws with the builder, as `{ element, toast }`.
const withToast = <Tag extends string, R>(
  part: View.Part<Tag, [toast: ToastItem], R>
) =>
  View.wrapPart(
    part,
    <B extends View.PartTarget<Tag>>(
      { element, toast }: { readonly element: B; readonly toast: ToastItem }
    ): ReturnType<B["attr"]> => part(element, toast)
  )

/**
 * Keeps the app's toasts, and draws them with the consumer's markup where it
 * places the viewport. Call it once near the root with a `view` closure that
 * holds the app's body and the toasts, drawn with `toastProvider.toasts` and the parts.
 *
 * **Details**
 *
 * The provider shares state with the components in its closure, so any
 * `update` below it can `$.send(ToastProvider, ...)` a `RequestedAdd`,
 * `RequestedUpdate` or `RequestedClose`. A component that sends to it needs it
 * above: rendered outside the closure, it doesn't compile. The component
 * that renders the provider reaches it the same way, from a component
 * inside the closure.
 *
 * The parts also return `toasts`, newest first, closing toasts included,
 * and `expanded`. Draw every toast in `toasts`, limited and closing
 * ones too: a toast leaves the list once its root's exit transition ends.
 * A message an action button sends goes to the component whose closure
 * draws it, and the toast's `id` says which toast it was.
 *
 * Every provider update re-runs the closure, so put the app's body in it as
 * one normal component, which skips the re-render when its props are equal.
 *
 * The provider's attributes win over the ones the consumer set on the
 * builder it passes in: the ARIA and data attributes, ids, `tabindex`,
 * `inert` and `type`. That includes the ones a state leaves absent.
 * `aria-label` on the viewport is the consumer's, `"Notifications"` when
 * it sets none. The CSS variables are added after the consumer's inline
 * style. A handler the consumer adds to a part runs after the provider's
 * own.
 *
 * History restore saves nothing of it: after Back, forward or a reload it
 * starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const ToastProvider = Html.component({
  name: "ToastProvider",
  props: ToastProviderProps,
  model: ToastProviderModel,
  message: ToastProviderMessage,
  events: ToastProviderEvents,
  // Senders only post, so there's nothing for them to read.
  shares: {
    value: () => ({}),
    receives: ["RequestedAdd", "RequestedUpdate", "RequestedClose"]
  },
  restore: false
}).make({
  init: () => ({
    toasts: [],
    hovering: false,
    focused: false,
    windowFocused: true
  }),
  update: {
    // A toast that shows is replaced in place. One that is closing is added
    // again, as new.
    RequestedAdd: ($, { toast }) => {
      const existing = shown($.model, toast.id)
      const entry: Entry = {
        ...toast,
        transition: existing?.transition ?? "starting",
        height: existing?.height ?? 0
      }
      const toasts = existing === undefined
        ? [entry, ...$.model.toasts.filter((other) => other.id !== toast.id)]
        : replace($.model, entry)
      return $.evolve({ toasts }).run(...timer($, entry))
    },
    // A running timer goes on, unless the update sets a timeout. One starts
    // when the update makes the toast timed, as when a loading toast gets
    // its result.
    RequestedUpdate: ($, { _tag, id, ...changes }) => {
      const entry = shown($.model, id)
      if (entry === undefined) return $.model
      const next: Entry = { ...entry, ...changes }
      const step = $.evolve({ toasts: replace($.model, next) })
      const running = timed(entry, $.props) && timed(next, $.props) &&
        changes.timeout === undefined
      return running ? step : step.run(...timer($, next))
    },
    RequestedClose: ($, { id }) => close($, id, false),
    ClickedClose: dismiss,
    PressedEscape: dismiss,
    CompletedWaitBeforeDismissal: (
      $,
      message
    ) => (pausedBy($.model) ? $.model : dismiss($, message)),
    EnteredViewport: ($) =>
      settle($, UiStruct.evolve($.model, { hovering: true })),
    LeftViewport: ($) =>
      settle($, UiStruct.evolve($.model, { hovering: false })),
    FocusedViewport: ($) =>
      settle($, UiStruct.evolve($.model, { focused: true })),
    BlurredViewport: ($) =>
      settle($, UiStruct.evolve($.model, { focused: false })),
    FocusedWindow: ($) =>
      settle($, UiStruct.evolve($.model, { windowFocused: true })),
    BlurredWindow: ($) =>
      settle($, UiStruct.evolve($.model, { windowFocused: false })),
    // The first measure ends the starting style. A closing toast keeps its
    // height at 0, so the toasts behind it move up.
    MeasuredToast: ($, { id, height }) => {
      const entry = shown($.model, id)
      return entry === undefined
        ? $.model
        : $.evolve({
          toasts: replace(
            $.model,
            UiStruct.evolve(entry, { transition: "shown", height })
          )
        })
    },
    FinishedExit: ($, { id }) =>
      shown($.model, id) === undefined
        ? $.evolve({
          toasts: $.model.toasts.filter((toast) => toast.id !== id)
        })
        : $.model
  },
  subscriptions: () => windowFocus,
  parts: (p, model) => {
    const expanded = expandedBy(model)
    const stack = stackOf(model.toasts, p.props.limit ?? 3)
    const toasts: ReadonlyArray<ToastItem> = model.toasts.map((
      { height: _, transition, ...data }
    ) => ({
      ...data,
      transitionStatus: transition === "shown" ? undefined : transition,
      limited: stack.get(data.id)?.limited === true
    }))
    const empty = !model.toasts.some((toast) => toast.transition !== "ending")
    const frontmost = model.toasts[0]?.height ?? 0
    const owner = p.id("viewport")
    // A high-priority toast is announced at once by an alert copy of its
    // text. Its root is `aria-live="off"`, so the polite viewport doesn't
    // read it again.
    const urgent = model.toasts.filter((toast) =>
      toast.priority === "high" && toast.transition !== "ending"
    )
    const alerts = urgent.length === 0 ? undefined : View.toNode(
      new Html.Element<never>("div").attr("style", visuallyHidden).children(
        ...urgent.map((toast) =>
          new Html.Element<never>("div").key(toast.id).attrs({
            role: "alert",
            "aria-atomic": "true"
          }).children(
            new Html.Element<never>("div").children(toast.title ?? ""),
            new Html.Element<never>("div").children(toast.description ?? "")
          )
        )
      )
    )
    const viewport = p.part("div", (b) =>
      b.attrs({
        role: "region",
        tabindex: "-1",
        "aria-live": "polite",
        "aria-atomic": "false",
        "aria-relevant": "additions text",
        "data-expanded": flag(expanded)
      })
        .on("mouseenter", ToastProviderMessage.EnteredViewport())
        .on("mouseleave", ToastProviderMessage.LeftViewport())
        .popover("manual", true)
        .onMount(
          TrackViewport({ id: owner, empty, hovering: model.hovering }).pipe(
            Mount.map((fact) => ToastProviderMessage[fact]())
          )
        )
        .forward((node) => {
          const labelled = node.elementAttrs["aria-label"] === undefined
            ? node.attr("aria-label", "Notifications")
            : node
          const styled = frontmost > 0
            ? labelled.attr(
              "style",
              withStyle(
                node.elementAttrs.style,
                `--toast-frontmost-height:${frontmost}px`
              )
            )
            : labelled
          return alerts === undefined ? styled : styled.children(alerts)
        }))

    const rootPart = p.part("div", (b, toast: ToastItem) => {
      const place = stack.get(toast.id)
      const high = toast.priority === "high"
      const ending = toast.transitionStatus === "ending"
      const vars = place === undefined ? undefined : [
        `--toast-index:${place.index}`,
        `--toast-offset-y:${place.offset}px`,
        place.height > 0 ? `--toast-height:${place.height}px` : undefined
      ].filter((declaration) => declaration !== undefined).join(";")
      return b.attrs({
        role: high ? "alertdialog" : "dialog",
        [rootAttr]: owner,
        tabindex: "0",
        "aria-modal": "false",
        "aria-labelledby": toast.title !== undefined
          ? p.id("title", toast.id)
          : undefined,
        "aria-describedby": toast.description !== undefined
          ? p.id("description", toast.id)
          : undefined,
        "aria-live": high ? "off" : undefined,
        inert: flag(toast.limited),
        "data-expanded": flag(expanded),
        "data-limited": flag(toast.limited),
        "data-type": toast.type,
        "data-starting-style": flag(toast.transitionStatus === "starting"),
        "data-ending-style": flag(ending)
      })
        .on("keydown", (
          { key }
        ) => (key === "Escape"
          ? ToastProviderMessage.PressedEscape({ id: toast.id })
          : undefined))
        .onMount(
          TrackToast({ id: toast.id, ending }).pipe(
            Mount.map((tracked) =>
              tracked._tag === "Measured"
                ? ToastProviderMessage.MeasuredToast({
                  id: toast.id,
                  height: tracked.height
                })
                : ToastProviderMessage.FinishedExit({ id: toast.id })
            )
          )
        )
        .forward((
          node
        ) => (vars === undefined
          ? node
          : node.attr("style", withStyle(node.elementAttrs.style, vars)))
        )
    })
    // The key keeps a toast's element, and its mount, as the list changes. A
    // part can't set it, so the builder gets it first.
    const root = View.wrapPart(
      rootPart,
      <
        B extends View.PartTarget<"div"> & {
          readonly key: (key: string) => View.PartTarget<"div">
        }
      >(
        { element, toast }: { readonly element: B; readonly toast: ToastItem }
      ): ReturnType<B["attr"]> => rootPart(element.key(toast.id), toast)
    )
    const contentPart = p.part(
      "div",
      (b, toast: ToastItem) =>
        b.attrs({
          "data-expanded": flag(expanded),
          "data-behind": flag(
            (stack.get(toast.id)?.index ?? 0) > 0 &&
              toast.transitionStatus !== "ending"
          )
        })
    )
    const titlePart = p.part((b, toast: ToastItem) =>
      b.attrs({ id: p.id("title", toast.id), "data-type": toast.type })
    )
    const descriptionPart = p.part((b, toast: ToastItem) =>
      b.attrs({ id: p.id("description", toast.id), "data-type": toast.type })
    )
    const actionPart = p.part(
      "button",
      (b, toast: ToastItem) =>
        b.attrs({ type: "button", "data-type": toast.type })
    )
    const closePart = p.part(
      "button",
      (b, toast: ToastItem) =>
        b.attrs({ type: "button", "data-type": toast.type })
          .on("click", ToastProviderMessage.ClickedClose({ id: toast.id }))
    )
    return {
      toasts,
      expanded,
      viewport,
      root,
      content: withToast(contentPart),
      title: withToast(titlePart),
      description: withToast(descriptionPart),
      action: withToast(actionPart),
      close: withToast(closePart)
    }
  }
})
