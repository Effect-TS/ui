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
 * sending facts to it with `$.send(ToastProvider, message)`:
 *
 * - `{ _tag: "AddedToast", toast }` shows `toast`. The sender picks its `id`,
 *   so it can update or close it later. A toast with an `id` that already
 *   shows is replaced, and its timer starts again.
 * - `{ _tag: "UpdatedToast", id, ...changes }` changes the fields it names on
 *   a toast that shows. A toast that has closed stays closed.
 * - `{ _tag: "ClosedToast", id }` closes a toast.
 *
 * When the user closes a toast, with the close part, Escape or its timeout,
 * the provider emits `Dismissed` with its `id`.
 *
 * A toast that is loading, then done, is an `AddedToast` with
 * `type: "loading"` when the work starts, and an `UpdatedToast` with the
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
 * `t.title({ element: h.strong, toast }).children(toast.title)`. `root` sets
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
 * F6 moves focus into the viewport while it holds a toast, and F6 again, or
 * Shift+Tab from the viewport, returns it to where it was. Tab moves through
 * the toasts, which are focusable, and their buttons. Escape closes the toast
 * that has focus. When a focused toast closes, focus moves to the next toast,
 * or back to where it was before F6.
 *
 * **Timers**
 *
 * A toast closes after its `timeout`, or the provider's, 5000 ms by
 * default. `0` and `type: "loading"` turn it off. Every timer pauses
 * while the stack is expanded or the window doesn't have focus, and starts
 * again from the full timeout when it resumes. A toast added while paused
 * waits for the resume.
 *
 * **Limits**
 *
 * The toasts render where the viewport is, so place it with CSS, such as
 * `position: fixed`. Toasts anchored to another element, swiping a toast
 * away, and adding a toast from outside the component tree aren't
 * supported. Code outside the tree reaches the app through a Command result,
 * whose `update` can send to the provider.
 *
 * **Example** (A save button that shows a toast)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { ToastProvider } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const EditorMessage = UiSchema.TaggedEnum({ ClickedSave: {} })
 *
 * // Any component below the provider can send to it.
 * const Editor = Component.define({ name: "Editor", model: Schema.Null, message: EditorMessage, elements: Html }).make({
 *   init: () => null,
 *   update: (model, _message, $) =>
 *     $.set(model).send(ToastProvider, {
 *       _tag: "AddedToast",
 *       toast: { id: "saved", title: "Saved", type: "success" }
 *     }),
 *   view: (_, h) => h.button.onClick(EditorMessage.ClickedSave()).children("Save")
 * })
 *
 * const App = Component.define({ name: "App", model: Schema.Null, message: Schema.Never, elements: Html }).make({
 *   init: () => null,
 *   update: (model) => model,
 *   view: (_, h) =>
 *     ToastProvider(h, {
 *       view: (t) =>
 *         h.div(
 *           Editor(h, {}),
 *           t.viewport(h.div.class("toasts")).children(
 *             ...t.toasts.map((toast) =>
 *               t.root({ element: h.div.class("toast"), toast }).children(
 *                 t.title({ element: h.strong, toast }).children(toast.title),
 *                 t.close({ element: h.button, toast }).children("Dismiss")
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
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { flag } from "./internal/attributes.ts"

/**
 * The content of a toast, as a sender posts it in `AddedToast`.
 *
 * **Details**
 *
 * - `id`: required, and picked by the sender, so a later `UpdatedToast`
 *   or `ClosedToast` can name the toast. Build it from domain data, such
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
 * The content of a toast, as a sender posts it in `AddedToast`.
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
 * part or Escape, or that its timeout ran out. A `ClosedToast` sent to the
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
const Message = UiSchema.TaggedEnum({
  AddedToast: { toast: ToastData },
  UpdatedToast: {
    id: Schema.String,
    title: Schema.optional(Schema.String),
    description: Schema.optional(Schema.String),
    type: Schema.optional(Schema.String),
    timeout: Schema.optional(Schema.Number),
    priority: Schema.optional(Schema.Literals(["low", "high"]))
  },
  ClosedToast: { id: Schema.String },
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

type Message = typeof Message.Type

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
const Model = Schema.Struct({
  toasts: Schema.Array(Entry),
  hovering: Schema.Boolean,
  focused: Schema.Boolean,
  windowFocused: Schema.Boolean
})

type Model = typeof Model.Type

// One run per toast: a new run for a toast replaces its running one, and a
// pause interrupts them all, so a cut wait sends nothing.
const WaitBeforeDismissal = Command.make(
  "WaitBeforeDismissal",
  { args: { id: Schema.String, timeout: Schema.Number }, mode: "switch", group: ["id"] },
  ({ id, timeout }) => Effect.as(Effect.sleep(Duration.millis(timeout)), Message.CompletedWaitBeforeDismissal({ id }))
)

type Tracked = { readonly _tag: "Measured"; readonly height: number } | { readonly _tag: "Finished" }

// Measures a toast's natural height, again whenever its size or content
// changes, and reports when its exit transition has finished. `ending`
// follows the toast: the wait starts when it turns true, and a toast added
// again while it's ending is measured again. `id` names the toast in the
// log.
const TrackToast = Mount.makeStream(
  "TrackToast",
  { args: { id: Schema.String, ending: Schema.Boolean } },
  (node: HTMLElement, _args, changes) =>
    Stream.callback<Tracked>((queue) =>
      Effect.gen(function*() {
        let last = -1
        let ending = false
        // The height the toast would have without the consumer's stacking
        // styles, which may clamp it.
        const measure = () => {
          if (ending) return
          const previous = node.style.height
          node.style.height = "auto"
          const height = node.offsetHeight
          node.style.height = previous
          if (height === last) return
          last = height
          Queue.offerUnsafe(queue, { _tag: "Measured", height })
        }
        // Once the transitions the ending style starts have run. Without
        // any, at once.
        const finish = (round: number) =>
          requestAnimationFrame(() => {
            const animations = typeof node.getAnimations === "function" ? node.getAnimations() : []
            void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
              if (ending && round === rounds) Queue.offerUnsafe(queue, { _tag: "Finished" })
            })
          })
        let rounds = 0
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const resize = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : undefined
            const mutation = typeof MutationObserver === "function" ? new MutationObserver(measure) : undefined
            resize?.observe(node)
            mutation?.observe(node, { childList: true, subtree: true, characterData: true })
            return () => {
              resize?.disconnect()
              mutation?.disconnect()
            }
          }),
          (disconnect) => Effect.sync(disconnect)
        )
        yield* Stream.runForEach(changes, (args) =>
          Effect.sync(() => {
            rounds += 1
            ending = args.ending
            if (ending) {
              finish(rounds)
            } else {
              last = -1
              measure()
            }
          })).pipe(Effect.forkScoped)
      })
    )
)

type ViewportFact = "FocusedViewport" | "BlurredViewport" | "FocusedWindow" | "BlurredWindow" | "LeftViewport"

// The roots in a viewport that can take focus: not closing, not limited.
const focusable =
  "[role=dialog]:not([data-ending-style]):not([inert]),[role=alertdialog]:not([data-ending-style]):not([inert])"

// What the viewport needs from its document and window: F6 into the
// viewport and back, keyboard focus inside it, the window's focus, a pointer
// that left while the toast under it was removed, and focus that sat on a
// toast as it closed. `empty`: no toast shows, so F6 is the page's.
// `hovering`: what the Model believes about the pointer.
const TrackViewport = Mount.makeStream(
  "TrackViewport",
  { args: { empty: Schema.Boolean, hovering: Schema.Boolean } },
  (node: HTMLElement, args, changes) =>
    Stream.callback<ViewportFact>((queue) =>
      Effect.gen(function*() {
        const document = node.ownerDocument
        const window = document.defaultView
        let { empty, hovering } = args
        let focused = false
        // Where focus was before F6 moved it into the viewport.
        let previous: HTMLElement | null = null
        const restore = (): boolean => {
          if (previous === null) return false
          if (previous === document.body) (document.activeElement as HTMLElement | null)?.blur()
          else previous.focus({ preventScroll: true })
          const restored = !node.contains(document.activeElement)
          if (restored) previous = null
          return restored
        }
        const onKeyDown = (event: KeyboardEvent) => {
          if (event.defaultPrevented) return
          if (event.key === "F6") {
            if (node.contains(document.activeElement)) {
              if (restore()) event.preventDefault()
            } else if (!empty) {
              event.preventDefault()
              previous = document.activeElement as HTMLElement | null
              node.focus({ preventScroll: true, focusVisible: true } as FocusOptions)
            }
          } else if (event.key === "Tab" && event.shiftKey && event.target === node && restore()) {
            event.preventDefault()
          }
        }
        // Only keyboard focus expands the stack, so a click on a toast
        // doesn't hold it open after the pointer leaves.
        const onFocusIn = (event: FocusEvent) => {
          const target = event.target as Element | null
          if (focused || target === null || !target.matches(":focus-visible")) return
          focused = true
          Queue.offerUnsafe(queue, "FocusedViewport")
        }
        const onFocusOut = (event: FocusEvent) => {
          if (!focused || node.contains(event.relatedTarget as Node | null)) return
          focused = false
          Queue.offerUnsafe(queue, "BlurredViewport")
        }
        const onWindowFocus = (event: FocusEvent) => {
          if (event.target === window) Queue.offerUnsafe(queue, "FocusedWindow")
        }
        const onWindowBlur = (event: FocusEvent) => {
          if (event.target === window) Queue.offerUnsafe(queue, "BlurredWindow")
        }
        // A toast removed under the pointer sends no mouseleave.
        const onMouseOver = (event: MouseEvent) => {
          if (hovering && !node.contains(event.target as Node | null)) {
            hovering = false
            Queue.offerUnsafe(queue, "LeftViewport")
          }
        }
        // A toast that closes with focus inside hands it to the next toast,
        // or back to where it was before F6.
        const handOff = (records: ReadonlyArray<MutationRecord>) => {
          for (const record of records) {
            const closing = record.target as HTMLElement
            if (!closing.hasAttribute("data-ending-style") || !closing.contains(document.activeElement)) continue
            const roots = Array.from(node.querySelectorAll<HTMLElement>(focusable))
            const after = roots.find((root) => closing.compareDocumentPosition(root) & 4)
            const next = after ?? roots.at(-1)
            if (next !== undefined) next.focus()
            else if (!restore()) node.focus({ preventScroll: true })
          }
        }
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const observer = typeof MutationObserver === "function" ? new MutationObserver(handOff) : undefined
            observer?.observe(node, { subtree: true, attributes: true, attributeFilter: ["data-ending-style"] })
            document.addEventListener("keydown", onKeyDown)
            document.addEventListener("mouseover", onMouseOver, true)
            node.addEventListener("focusin", onFocusIn)
            node.addEventListener("focusout", onFocusOut)
            window?.addEventListener("focus", onWindowFocus, true)
            window?.addEventListener("blur", onWindowBlur, true)
            return () => {
              observer?.disconnect()
              document.removeEventListener("keydown", onKeyDown)
              document.removeEventListener("mouseover", onMouseOver, true)
              node.removeEventListener("focusin", onFocusIn)
              node.removeEventListener("focusout", onFocusOut)
              window?.removeEventListener("focus", onWindowFocus, true)
              window?.removeEventListener("blur", onWindowBlur, true)
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

const dismissed = (id: string) => ToastProviderEvents.Dismissed({ id })

// The timers run while nothing expands the stack and the window has focus.
const pausedBy = (model: Model): boolean => model.hovering || model.focused || !model.windowFocused

const timeoutOf = (toast: ToastData, props: ToastProviderProps): number => toast.timeout ?? props.timeout ?? 5000

// A toast that should be counting down, paused or not.
const timed = (entry: Entry, props: ToastProviderProps): boolean =>
  entry.transition !== "ending" && entry.type !== "loading" && timeoutOf(entry, props) > 0

const wait = (entry: Entry, props: ToastProviderProps) =>
  WaitBeforeDismissal({ id: entry.id, timeout: timeoutOf(entry, props) })

const stop = (id: string) => Command.interrupt(WaitBeforeDismissal, { id })

// Visually hidden, but read by screen readers.
const hidden =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0"

// The parts add their declarations, in `forward`, after the consumer's
// inline style, so theirs win and the consumer's others stay.
const withStyle = (consumer: string | undefined, own: string): string =>
  consumer === undefined || consumer.trim() === "" ? own : consumer.replace(/;\s*$/, "") + ";" + own

// Where each toast sits in the stack: its index from the front, the height
// of the toasts in front of it, and whether it's past the limit. A closing
// toast keeps its place in the list but leaves the count.
const stackOf = (toasts: ReadonlyArray<Entry>, limit: number) => {
  const stack = new Map<string, { readonly index: number; readonly offset: number; readonly limited: boolean }>()
  let visible = 0
  let offset = 0
  toasts.forEach((toast, index) => {
    const ending = toast.transition === "ending"
    stack.set(toast.id, { index: ending ? index : visible, offset, limited: !ending && visible >= limit })
    offset += toast.height
    if (!ending) visible += 1
  })
  return stack
}

// A part that takes the toast it draws with the builder, as `{ element, toast }`.
const withToast = <Tag extends string, R>(part: View.Part<Tag, [toast: ToastItem], R>) =>
  View.wrapPart(
    part,
    <B extends View.PartTarget<Tag>>(
      { element, toast }: { readonly element: B; readonly toast: ToastItem }
    ): ReturnType<B["attr"]> => part(element, toast)
  )

/**
 * Keeps the app's toasts, and draws them with the consumer's markup where it
 * places the viewport. Call it once near the root with a `view` closure that
 * holds the app's body and the toasts, drawn with `t.toasts` and the parts.
 *
 * **Details**
 *
 * The provider shares state with the components in its closure, so any
 * `update` below it can `$.send(ToastProvider, ...)` an `AddedToast`,
 * `UpdatedToast` or `ClosedToast`. A component that sends to it needs it
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
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const ToastProvider = Component.define({
  name: "ToastProvider",
  props: ToastProviderProps,
  model: Model,
  message: Message,
  events: ToastProviderEvents,
  receives: ["AddedToast", "UpdatedToast", "ClosedToast"],
  // Senders only post, so there's nothing for them to read.
  shares: () => ({}),
  elements: Html
}).make({
  init: () => ({ toasts: [], hovering: false, focused: false, windowFocused: true }),
  update: (model, message, $) => {
    const props = $.props
    const paused = pausedBy(model)
    const find = (id: string) => model.toasts.find((toast) => toast.id === id)
    const replace = (entry: Entry) => model.toasts.map((toast) => (toast.id === entry.id ? entry : toast))
    // Start a toast's timer, unless the timers are paused, or stop it.
    const timer = (entry: Entry) => (timed(entry, props) ? (paused ? [] : [wait(entry, props)]) : [stop(entry.id)])
    // Move to `next`, pausing every timer or starting them again when the
    // pause changes.
    const settle = (next: Model) => {
      const step = $.set(next)
      if (!paused && pausedBy(next)) return step.run(Command.interrupt(WaitBeforeDismissal))
      if (paused && !pausedBy(next)) {
        return step.run(...next.toasts.filter((toast) => timed(toast, props)).map((toast) => wait(toast, props)))
      }
      return step
    }
    // A toast that shows starts closing. Once none shows, the pointer is
    // taken to have left, since a viewport that empties sends no mouseleave.
    const close = (id: string, user: boolean) => {
      const entry = find(id)
      if (entry === undefined || entry.transition === "ending") return model
      const toasts = replace({ ...entry, transition: "ending", height: 0 })
      const showing = toasts.some((toast) => toast.transition !== "ending")
      const step = settle({ ...model, toasts, hovering: showing && model.hovering }).run(stop(id))
      return user ? step.emit(dismissed(id)) : step
    }
    return Message.match(message, {
      // A toast that shows is replaced in place. One that is closing is
      // added again, as new.
      AddedToast: ({ toast }) => {
        const existing = find(toast.id)
        if (existing !== undefined && existing.transition !== "ending") {
          const entry: Entry = { ...toast, transition: existing.transition, height: existing.height }
          return $.set({ ...model, toasts: replace(entry) }).run(...timer(entry))
        }
        const entry: Entry = { ...toast, transition: "starting", height: 0 }
        const toasts = [entry, ...model.toasts.filter((other) => other.id !== toast.id)]
        return $.set({ ...model, toasts }).run(...timer(entry))
      },
      // The timer starts again when the update sets a timeout or starts it,
      // as when a loading toast gets its result.
      UpdatedToast: ({ _tag, id, ...changes }) => {
        const entry = find(id)
        if (entry === undefined || entry.transition === "ending") return model
        const next: Entry = { ...entry, ...changes }
        const restart = !timed(entry, props) || changes.timeout !== undefined
        const step = $.set({ ...model, toasts: replace(next) })
        return !timed(next, props) || restart ? step.run(...timer(next)) : step
      },
      ClosedToast: ({ id }) => close(id, false),
      ClickedClose: ({ id }) => close(id, true),
      PressedEscape: ({ id }) => close(id, true),
      CompletedWaitBeforeDismissal: ({ id }) => (paused ? model : close(id, true)),
      EnteredViewport: () => settle({ ...model, hovering: true }),
      LeftViewport: () => settle({ ...model, hovering: false }),
      FocusedViewport: () => settle({ ...model, focused: true }),
      BlurredViewport: () => settle({ ...model, focused: false }),
      FocusedWindow: () => settle({ ...model, windowFocused: true }),
      BlurredWindow: () => settle({ ...model, windowFocused: false }),
      // The first measure ends the starting style. A closing toast keeps
      // its height at 0, so the toasts behind it move up.
      MeasuredToast: ({ id, height }) => {
        const entry = find(id)
        if (entry === undefined || entry.transition === "ending") return model
        return { ...model, toasts: replace({ ...entry, transition: "shown", height }) }
      },
      FinishedExit: ({ id }) =>
        find(id)?.transition === "ending"
          ? { ...model, toasts: model.toasts.filter((toast) => toast.id !== id) }
          : model
    })
  },
  parts: (model, p) => {
    const expanded = model.hovering || model.focused
    const stack = stackOf(model.toasts, p.props.limit ?? 3)
    const entries = new Map(model.toasts.map((entry) => [entry.id, entry]))
    const toasts: ReadonlyArray<ToastItem> = model.toasts.map(({ height: _, transition, ...data }) => ({
      ...data,
      transitionStatus: transition === "shown" ? undefined : transition,
      limited: stack.get(data.id)?.limited === true
    }))
    const empty = !model.toasts.some((toast) => toast.transition !== "ending")
    const frontmost = model.toasts[0]?.height ?? 0
    // A high-priority toast is announced at once by an alert copy of its
    // text, and its root is hidden from screen readers while focus is
    // elsewhere, so it isn't read twice.
    const urgent = model.focused
      ? []
      : model.toasts.filter((toast) => toast.priority === "high" && toast.transition !== "ending")
    const alerts = urgent.length === 0 ? undefined : View.toNode(
      new Html.Element<never>("div").attr("style", hidden).children(
        ...urgent.map((toast) =>
          new Html.Element<never>("div").key(toast.id).attr("role", "alert").attr("aria-atomic", "true").children(
            new Html.Element<never>("div").children(toast.title ?? ""),
            new Html.Element<never>("div").children(toast.description ?? "")
          )
        )
      )
    )
    const typed = <B extends { readonly attr: (name: string, value: string | undefined) => B }>(
      builder: B,
      toast: ToastItem
    ): B => builder.attr("data-type", entries.get(toast.id)?.type)

    const viewport = p.part("div", (b) =>
      b.attr("role", "region")
        .attr("tabindex", "-1")
        .attr("aria-live", "polite")
        .attr("aria-atomic", "false")
        .attr("aria-relevant", "additions text")
        .attr("data-expanded", flag(expanded))
        .on("mouseenter", Message.EnteredViewport())
        .on("mouseleave", Message.LeftViewport())
        .onMount(TrackViewport({ empty, hovering: model.hovering }).pipe(Mount.map((fact) => Message[fact]())))
        .forward((node) => {
          const labelled = node.attrs["aria-label"] === undefined ? node.attr("aria-label", "Notifications") : node
          const styled = frontmost > 0
            ? labelled.attr("style", withStyle(node.attrs.style, `--toast-frontmost-height:${frontmost}px`))
            : labelled
          return alerts === undefined ? styled : styled.children(alerts)
        }))

    const rootPart = p.part("div", (b, toast: ToastItem) => {
      const entry = entries.get(toast.id)
      const place = stack.get(toast.id)
      const high = entry?.priority === "high"
      const ending = entry?.transition === "ending"
      const vars = place === undefined ? undefined : [
        `--toast-index:${place.index}`,
        `--toast-offset-y:${place.offset}px`,
        entry !== undefined && entry.height > 0 ? `--toast-height:${entry.height}px` : undefined
      ].filter((declaration) => declaration !== undefined).join(";")
      return b.attr("role", high ? "alertdialog" : "dialog")
        .attr("tabindex", "0")
        .attr("aria-modal", "false")
        .attr("aria-labelledby", entry?.title !== undefined ? p.id("title", toast.id) : undefined)
        .attr("aria-describedby", entry?.description !== undefined ? p.id("description", toast.id) : undefined)
        .attr("aria-hidden", high && !model.focused ? "true" : undefined)
        .attr("inert", flag(place?.limited))
        .attr("data-expanded", flag(expanded))
        .attr("data-limited", flag(place?.limited))
        .attr("data-type", entry?.type)
        .attr("data-starting-style", flag(entry?.transition === "starting"))
        .attr("data-ending-style", flag(ending))
        .onKeyDown(({ key }) => (key === "Escape" ? Message.PressedEscape({ id: toast.id }) : undefined))
        .onMount(
          TrackToast({ id: toast.id, ending }).pipe(
            Mount.map((tracked) =>
              tracked._tag === "Measured"
                ? Message.MeasuredToast({ id: toast.id, height: tracked.height })
                : Message.FinishedExit({ id: toast.id })
            )
          )
        )
        .forward((node) => (vars === undefined ? node : node.attr("style", withStyle(node.attrs.style, vars))))
    })
    // The key keeps a toast's element, and its mount, as the list changes.
    const root = View.wrapPart(
      rootPart,
      <B extends View.PartTarget<"div">>(
        { element, toast }: { readonly element: B; readonly toast: ToastItem }
      ): ReturnType<B["attr"]> =>
        (rootPart(element, toast) as unknown as View.ElementBuilder<Message>).key(toast.id) as any
    )
    const contentPart = p.part("div", (b, toast: ToastItem) =>
      b.attr("data-expanded", flag(expanded))
        .attr(
          "data-behind",
          flag((stack.get(toast.id)?.index ?? 0) > 0 && entries.get(toast.id)?.transition !== "ending")
        ))
    const titlePart = p.part((b, toast: ToastItem) => typed(b.attr("id", p.id("title", toast.id)), toast))
    const descriptionPart = p.part((b, toast: ToastItem) => typed(b.attr("id", p.id("description", toast.id)), toast))
    const actionPart = p.part("button", (b, toast: ToastItem) => typed(b.attr("type", "button"), toast))
    // Hidden from screen readers while the stack is collapsed: a keyboard
    // user reaches it by focusing the viewport, which expands the stack.
    const closePart = p.part("button", (b, toast: ToastItem) =>
      typed(b.attr("type", "button"), toast)
        .attr("aria-hidden", expanded ? undefined : "true")
        .onClick(Message.ClickedClose({ id: toast.id })))
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
