/**
 * A popup that opens on top of the page and asks for the user's attention,
 * such as a form, a confirmation or a detail view.
 *
 * `Dialog` is headless: it owns the ids, the ARIA, the data attributes, focus,
 * dismissal and the popup's place in the top layer, and the consumer draws
 * the markup. The consumer owns whether the dialog is open, passes it as
 * `open`, and stores what the `Opened` and `Dismissed` events report. The dialog
 * stays as it is until `open` changes, so a consumer can refuse a close, such
 * as an editor with unsaved changes asking first.
 *
 * **Anatomy**
 *
 * | Part           | Element                                              |
 * | :------------- | :--------------------------------------------------- |
 * | `trigger`      | `<button>` that opens the dialog                       |
 * | `portal`       | `<dialog>` in the top layer, around the parts below    |
 * | `backdrop`     | `<div>` that covers the page                           |
 * | `viewport`     | `<div>` that positions the popup                       |
 * | `popup`        | `<div>` with the dialog's content                      |
 * | `title`        | a heading, `<h1>` to `<h6>`, that labels the dialog          |
 * | `description`  | `<p>` that describes the dialog                        |
 * | `close`        | `<button>` that closes the dialog                      |
 * | `initialFocus` | any element, focused when the dialog opens           |
 * | `finalFocus`   | any element, focused when the dialog closes          |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children:
 * `dialog.portal(h.dialog)?.children(dialog.popup(h.div).children(dialog.title(h.h2).children("Settings")))`.
 * The portal returns `undefined` while the dialog is closed, unless
 * `keepMounted`, and the backdrop returns `undefined` in a nested dialog, unless
 * `forceRenderBackdrop`. `backdrop` and `viewport` are optional. A part's result
 * is a builder, so it can also be another kit call's `element`, such as a
 * ui-kit Button's.
 *
 * The portal is a `<dialog>` shown in the top layer, so the dialog needs no
 * portal to another place in the document. The kit resets its box inline to
 * an empty one at the viewport's corner, with nothing visible of its own, so
 * style the backdrop, viewport and popup as fixed-position layers:
 * `.viewport { position: fixed; inset: 0; display: grid; place-items: center }`.
 * A modal dialog also has the browser's `::backdrop`. Style that instead of
 * drawing the backdrop part, or hide it with
 * `dialog::backdrop { display: none }` when you draw it.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent:
 *
 * - `trigger`: `data-popup-open`
 * - `backdrop`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`
 * - `viewport` and `popup`: the backdrop's, and `data-nested` and
 *   `data-nested-dialog-open`
 *
 * The popup also sets the CSS variable `--nested-dialogs`, the number of
 * dialogs open inside this one. `data-starting-style` is present for the first
 * frame after the dialog opens and `data-ending-style` while it closes, so a
 * transition can start from and end in a hidden style. The dialog stays in the
 * top layer until the transitions and animations in it finish, then closes and
 * emits `Settled`. One that loops, such as a spinner's, doesn't count. For an
 * exit the kit can't see, such as one run by an animation library, set
 * `holdExit` while it runs: the dialog stays in its ending state until it is
 * cleared.
 *
 * **Keyboard**
 *
 * The trigger and the close button are native buttons, so Enter and Space
 * press them. Escape asks the topmost open dialog to close, wherever focus is.
 * When the dialog opens, focus moves to the `initialFocus` element, or else
 * to the first element in the popup that Tab reaches, or else to the popup.
 * Opened by touch, it focuses the popup instead of the first field, so the
 * on-screen keyboard doesn't open, but still focuses an `initialFocus` element.
 * When the dialog closes with focus inside it, focus moves to the
 * `finalFocus` element, or else to the trigger that opened it. Tab stays
 * inside a modal dialog, and inside one with `modal: "trap-focus"`.
 *
 * **Modes**
 *
 * - `modal: true`, the default: the dialog opens as a modal. The rest of the
 *   page is inert, focus stays inside, and the page doesn't scroll.
 * - `modal: "trap-focus"`: focus stays inside, but the page behind still
 *   scrolls and takes clicks.
 * - `modal: false`: the page stays usable, and the dialog asks to close when
 *   focus leaves it.
 *
 * A press outside the popup asks the topmost dialog to close: a press with
 * the main mouse button, or one finger. `disablePointerDismissal` turns that
 * off, and the close on focus leaving with it.
 *
 * Two things differ from a dialog that draws its own modal layer, because a
 * modal dialog here is the browser's:
 *
 * - A modal dialog stays modal until its exit transition ends. Until then the
 *   page takes no clicks and focus stays in the dialog, then focus moves back.
 * - With `modal: true`, `initialFocus: false` focuses the popup, since the
 *   trigger is inert. In the other modes, focus stays on the trigger.
 *
 * **Nesting**
 *
 * A dialog drawn inside another one's popup is nested. It finds the dialog
 * above it by itself: the outer popup gets `data-nested-dialog-open` and
 * `--nested-dialogs`, the inner one `data-nested`, and only the inner one hears
 * Escape and outside presses. Two dialogs under one parent each take a `key`.
 * Of two dialogs open side by side, the one opened later is on top, as in the
 * browser's top layer, and only it hears Escape and outside presses. Focus
 * a dialog moves by itself, into it as it opens or back to its trigger as it
 * closes, doesn't close another one with `modal: false`. Focus the user
 * moves out of it still does.
 *
 * **Triggers drawn elsewhere**
 *
 * A `DialogTrigger` opens a dialog from another part of the page. Give the
 * dialog an `id` and the trigger the same `popupId`: the dialog then counts a
 * press on the trigger as the trigger's, not a press outside, and gives focus
 * back to it when it closes. Store the press's method and pass it as the
 * dialog's `openMethod`, so an open by touch is treated as one.
 *
 * **Example** (A settings dialog whose open state lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Dialog } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const ToolbarMessage = UiSchema.TaggedEnum({ OpenedSettings: {}, DismissedSettings: {} })
 *
 * const Toolbar = Component.define({
 *   name: "Toolbar",
 *   scoped: false,
 *   model: Schema.Struct({ settings: Schema.Boolean }),
 *   message: ToolbarMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ settings: true }),
 *   update: {
 *     OpenedSettings: (model) => ({ ...model, settings: true }),
 *     DismissedSettings: (model) => ({ ...model, settings: false })
 *   },
 *   view: (model, h) =>
 *     Dialog(h, {
 *       props: { open: model.settings },
 *       onEmit: {
 *         Opened: () => ToolbarMessage.OpenedSettings(),
 *         Dismissed: () => ToolbarMessage.DismissedSettings(),
 *         Settled: () => undefined
 *       },
 *       view: (dialog) =>
 *         h.div(
 *           dialog.trigger(h.button.class("button")).children("Settings"),
 *           dialog.portal(h.dialog)?.children(
 *             dialog.viewport(h.div.class("viewport")).children(
 *               dialog.popup(h.div.class("popup")).children(
 *                 dialog.title(h.h2).children("Settings"),
 *                 dialog.close(h.button.class("button")).children("Close")
 *               )
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * // The popup keeps the consumer's class, and the dialog is labelled by its title.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Toolbar, {}))
 * const title = /<h2 id="([^"]+)"/.exec(html)?.[1]
 * if (title === undefined || !html.includes(`aria-labelledby="${title}"`) || !html.includes(`class="popup"`)) {
 *   throw new Error("the dialog isn't labelled by its title")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { flag, withStyle } from "./internal/attributes.ts"

/**
 * How a dialog limits the page behind it: `true` for a modal, `"trap-focus"`
 * to keep focus inside but leave the page usable, `false` for neither.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DialogModal = Schema.Union([Schema.Boolean, Schema.Literal("trap-focus")])

/**
 * How a dialog limits the page behind it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogModal = typeof DialogModal.Type

/**
 * How the user opened or closed a dialog. `keyboard` covers Enter and Space
 * on a button and Escape.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DialogInteraction = Schema.Literals(["mouse", "touch", "pen", "keyboard"])

/**
 * How the user opened or closed a dialog.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogInteraction = typeof DialogInteraction.Type

/**
 * Controls whether the dialog is open, how it treats the page behind it, and
 * where focus goes.
 *
 * **Details**
 *
 * - `open`: whether the dialog shows. Required: the consumer owns it.
 * - `modal`: `true` by default, `"trap-focus"` or `false`, as the module
 *   describes.
 * - `disablePointerDismissal`: a press outside the popup doesn't ask to
 *   close, and neither does focus leaving a dialog with `modal: false`.
 * - `triggerId`: the `id` of the trigger the dialog is open for, when it has
 *   several. Only that trigger gets `aria-expanded` and `data-popup-open`, and
 *   focus goes back to it. With none, every trigger reports the dialog open.
 * - `keepMounted`: the portal stays in the page while the dialog is closed,
 *   hidden.
 * - `forceRenderBackdrop`: a nested dialog draws its backdrop too.
 * - `initialFocus`: `false` leaves focus where it is when the dialog opens.
 * - `finalFocus`: `false` leaves focus where it is when the dialog closes.
 * - `id`: the portal's `id`, generated when left out. Set it to pair the
 *   dialog with a `DialogTrigger` drawn somewhere else, as its `popupId`.
 * - `openMethod`: how the user opened the dialog, for a dialog opened from a
 *   `DialogTrigger`, whose press reports it. It wins over the one the
 *   dialog's own trigger records, and decides the focus of a touch open.
 * - `holdExit`: a closed dialog stays shown, in its ending state, while this
 *   is `true`, for an exit animation that the consumer runs itself. Set it
 *   back to `false` once that animation ends, and the dialog closes and
 *   emits `Settled`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DialogProps = Schema.Struct({
  open: Schema.Boolean,
  modal: Schema.optional(DialogModal),
  disablePointerDismissal: Schema.optional(Schema.Boolean),
  triggerId: Schema.optional(Schema.NullOr(Schema.String)),
  keepMounted: Schema.optional(Schema.Boolean),
  forceRenderBackdrop: Schema.optional(Schema.Boolean),
  initialFocus: Schema.optional(Schema.Boolean),
  finalFocus: Schema.optional(Schema.Boolean),
  id: Schema.optional(Schema.String),
  openMethod: Schema.optional(Schema.NullOr(DialogInteraction)),
  holdExit: Schema.optional(Schema.Boolean)
})

/**
 * The props of a `Dialog`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogProps = typeof DialogProps.Type

/**
 * Why a dialog asks to close: a press on its open trigger, a press outside
 * the popup, Escape, a press on the close part, or focus leaving a dialog
 * with `modal: false`. A close the browser forces after the consumer refused
 * Escape is `escape-key` too.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DialogDismissReason = Schema.Literals([
  "trigger-press",
  "outside-press",
  "escape-key",
  "close-press",
  "focus-out"
])

/**
 * Why a dialog asks to close.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogDismissReason = typeof DialogDismissReason.Type

/**
 * `Opened` requests that the dialog open, from a press on a trigger, with the
 * trigger's `id` if it has one. `Dismissed` requests that it close, with the
 * reason. The consumer decides whether to change `open`. `Settled` reports that
 * the transitions and animations of an open or a close finished.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DialogEvents = UiSchema.TaggedEnum({
  Opened: { triggerId: Schema.NullOr(Schema.String) },
  Dismissed: { reason: DialogDismissReason },
  Settled: { open: Schema.Boolean }
})

/**
 * What a `Dialog` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogEvents = typeof DialogEvents.Type

/**
 * Where a dialog is in its open or close transition: `starting` for the first
 * frame after it opens, `ending` while it closes, and `null` otherwise.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogTransitionStatus = "starting" | "ending" | null

// Presses and requests from the parts and the document, and the frames of a
// transition.
const Message = UiSchema.TaggedEnum({
  // The trigger's `id` when the part was applied, and the pointer of the
  // click: `""` for Enter or Space.
  ClickedTrigger: { triggerId: Schema.NullOr(Schema.String), pointerType: Schema.String },
  ClickedClose: { pointerType: Schema.String },
  // A modal's close request, Escape, and a close the browser forced.
  // `forced`: the browser won't let the request be cancelled, and its close
  // follows.
  CancelledModal: { forced: Schema.Boolean },
  ClosedModal: {},
  PressedEscape: {},
  PressedOutside: { pointerType: Schema.String },
  FocusedOutside: {},
  RenderedFirstFrame: {},
  FinishedTransition: { open: Schema.Boolean },
  // How many dialogs inside this one are open, from their reports.
  ChangedNested: { count: Schema.Number }
})

type Message = typeof Message.Type

// Only what the consumer would never store. `mounted`: the dialog shows, from
// the first frame after it opens until its exit ends. `nestedOpen`: the open
// dialogs inside this one. The methods are how it was last opened and closed.
// `forcedClose`: a close the browser forces is on its way.
const Model = Schema.Struct({
  mounted: Schema.Boolean,
  nestedOpen: Schema.Number,
  forcedClose: Schema.Boolean,
  openMethod: Schema.NullOr(DialogInteraction),
  closeMethod: Schema.NullOr(DialogInteraction)
})

type Model = typeof Model.Type

const methodOf = (pointerType: string): DialogInteraction =>
  pointerType === "touch" || pointerType === "pen" ? pointerType : pointerType === "" ? "keyboard" : "mouse"

const statusOf = (model: Model, props: DialogProps): DialogTransitionStatus =>
  props.open ? (model.mounted ? null : "starting") : model.mounted ? "ending" : null

// `$` in any handler of the Dialog's `update`: a tag's `$` fits the one
// over the whole message type.
type DialogUpdate = Component.Update<Model, Message, DialogEvents, DialogProps>

// Only the topmost dialog hears Escape and presses outside.
const topmost = (model: Model): boolean => model.nestedOpen === 0

const dismiss = (
  model: Model,
  $: DialogUpdate,
  reason: DialogDismissReason,
  closeMethod: DialogInteraction | null
) => $.set({ ...model, closeMethod }).emit(DialogEvents.Dismissed({ reason }))

// The browser gives a dialog a centred box with a border, padding, a
// background and a size. The kit empties it, so the parts inside lay out
// against the viewport. `overflow: visible` keeps them painted.
const portalBox = [
  "position:fixed",
  "inset:0",
  "width:0",
  "height:0",
  "max-width:none",
  "max-height:none",
  "margin:0",
  "padding:0",
  "border:0",
  "overflow:visible",
  "background:transparent",
  "color:inherit"
].join(";")

// -- the dialog's document work ----------------------------------------------

const tabbableSelector = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "summary",
  "[tabindex]",
  "[contenteditable=\"\"]",
  "[contenteditable=\"true\"]"
].join(",")

// The nearest element matching `selector` from `target`, which may be a text
// node.
const closestOf = (target: Node, selector: string): Element | null | undefined =>
  (target instanceof Element ? target : target.parentElement)?.closest(selector)

// Whether `element` is inside a dialog nested in `dialog`: its content is that
// dialog's to focus.
const inNested = (dialog: Element, element: Element): boolean => element.parentElement?.closest("dialog") !== dialog

// The elements in `root` that Tab reaches, in order: rendered, enabled and not
// taken out of the order. Positive `tabindex` values aren't reordered.
const tabbables = (dialog: Element, root: Element): Array<HTMLElement> =>
  Array.from(root.querySelectorAll<HTMLElement>(tabbableSelector)).filter((element) =>
    element.tabIndex >= 0 && element.getClientRects().length > 0 && !inNested(dialog, element) &&
    element.closest("[inert]") === null
  )

// A modal dialog locks the page's scroll while it shows. Nested modals share
// one lock, released by the last to close.
let scrollLocks = 0
let scrollBefore = ""
const lockScroll = (document: Document): () => void => {
  const root = document.documentElement
  if (scrollLocks++ === 0) {
    scrollBefore = root.style.overflow
    root.style.overflow = "hidden"
  }
  return () => {
    if (--scrollLocks === 0) root.style.overflow = scrollBefore
  }
}

const TrackDialogArgs = {
  modal: DialogModal,
  open: Schema.Boolean,
  mounted: Schema.Boolean,
  // No dialog inside this one is open, so it hears Escape and presses.
  topmost: Schema.Boolean,
  dismissible: Schema.Boolean,
  initialFocus: Schema.Boolean,
  finalFocus: Schema.Boolean,
  openMethod: Schema.NullOr(DialogInteraction),
  triggerId: Schema.NullOr(Schema.String),
  holdExit: Schema.Boolean,
  portalId: Schema.String,
  popupId: Schema.String
}

type TrackDialogArgs = Schema.Struct<typeof TrackDialogArgs>["Type"]

// The dialogs showing, in the order they started showing. One nested in
// another is above it, and of two others the later one is, as in the top
// layer. Only an open dialog with none open above it hears Escape, presses
// outside and focus moving, so it doesn't take what happens in one above it.
const showing: Array<{ readonly node: HTMLDialogElement; readonly open: () => boolean }> = []
const orderOf = (node: Element): number => showing.findIndex((entry) => entry.node === node)
const onTop = (node: HTMLDialogElement): boolean => {
  const mine = orderOf(node)
  return showing.every((other, index) =>
    other.node === node || !other.open() ||
    !(node.contains(other.node) || (!other.node.contains(node) && index > mine))
  )
}

// Focus a dialog moves, into itself as it opens or back to a trigger as it
// closes, is no user's: a dialog that isn't a modal doesn't take it as focus
// leaving it.
let handingOff = 0
const handOff = (element: HTMLElement | null | undefined): void => {
  if (element == null) return
  handingOff++
  try {
    element.focus()
  } finally {
    handingOff--
  }
}

// Whether focus went into a dialog above this one: a sibling shown later, or
// one the browser is showing and has focused before its mount starts.
const inDialogAbove = (node: HTMLDialogElement, target: Node): boolean => {
  const other = closestOf(target, "dialog")
  if (other == null || other === node || other.contains(node)) return false
  const index = orderOf(other)
  return index === -1 || index > orderOf(node)
}

// Whether an animation ends by itself: a looping one, such as a spinner's,
// doesn't hold a transition.
const finite = (animation: Animation): boolean => {
  const end = animation.effect?.getComputedTiming().endTime
  return typeof end === "number" && Number.isFinite(end)
}

// Everything the dialog does in the document while it shows, on the portal,
// as an element takes one mount: it focuses the dialog's content, reports
// Escape for a dialog that isn't a modal (a modal's comes to `onCancel`),
// presses outside the popup and focus leaving it, keeps Tab inside, locks
// the page's scroll for a modal, reports the first frame and the end of the
// transitions, and puts focus back once the dialog closes. Listeners on the
// document hear the capture phase, so a handler that stops an event can't
// hide it.
const TrackDialog = Mount.makeStream(
  "TrackDialog",
  { args: TrackDialogArgs },
  (node: HTMLDialogElement, args, changes) =>
    Stream.callback<Message>((queue) => {
      const document = node.ownerDocument
      const view = document.defaultView
      const frame = (f: () => void) => view === null ? setTimeout(f, 0) : view.requestAnimationFrame(f)
      let current: TrackDialogArgs = args
      const send = (message: Message) => Queue.offerUnsafe(queue, message)
      const popup = (): HTMLElement => (document.getElementById(current.popupId) as HTMLElement | null) ?? node
      const entry = { node, open: () => current.open }
      const topmost = () => current.topmost && onTop(node)
      // Every trigger the dialog is open for points at it, its own and a
      // `DialogTrigger` given its `popupId`, and every trigger is marked
      // with its id, so a press on one is the trigger's, not a press outside.
      const controls = `[aria-controls="${CSS.escape(args.portalId)}"]`
      const anyTrigger = `${controls},[data-dialog-trigger="${CSS.escape(args.portalId)}"]`
      const onTrigger = (target: Node): boolean =>
        closestOf(target, anyTrigger) != null || trigger?.contains(target) === true
      // The trigger focus goes back to: the one `triggerId` names, or else the
      // one that had focus when the dialog opened, or else the first that
      // points at it. Kept, since a trigger stops pointing at a closed dialog.
      const findTrigger = (): HTMLElement | null =>
        (current.triggerId === null ? null : document.getElementById(current.triggerId)) ??
          (document.activeElement instanceof HTMLElement && document.activeElement.matches(controls)
            ? document.activeElement
            : document.querySelector<HTMLElement>(controls))
      let trigger = findTrigger()
      // Whether focus was in the dialog when it last moved, so a close only
      // moves focus that the dialog had, and the element it was on.
      let focusInside = node.contains(document.activeElement)
      let lastFocused: HTMLElement | null = focusInside ? document.activeElement as HTMLElement : null

      const focusFirst = () => {
        if (!current.initialFocus) {
          // A modal's page is inert, so focus can't stay on the trigger.
          if (current.modal === true) handOff(popup())
          else handOff(trigger)
          return
        }
        const marked = Array.from(node.querySelectorAll<HTMLElement>("[autofocus]")).find((element) =>
          !inNested(node, element)
        )
        const root = popup()
        // An open by touch focuses the popup, so a field doesn't open the
        // on-screen keyboard, unless the consumer marked an element.
        handOff(marked ?? (current.openMethod === "touch" ? undefined : tabbables(node, root)[0]) ?? root)
      }

      const onKeyDown = (event: KeyboardEvent) => {
        const escape = event.key === "Escape"
        // A modal's Escape comes to `onCancel`, and only `trap-focus` keeps Tab.
        if (escape ? current.modal === true : event.key !== "Tab" || current.modal !== "trap-focus") return
        if (!current.open || !topmost()) return
        if (escape) {
          if (event.defaultPrevented || event.isComposing) return
          // So a dialog this one is inside doesn't take it as its own.
          event.preventDefault()
          send(Message.PressedEscape())
          return
        }
        const root = popup()
        const items = tabbables(node, root)
        const active = document.activeElement
        const first = items[0]
        const last = items.at(-1)
        if (first === undefined || last === undefined) {
          event.preventDefault()
          handOff(root)
        } else if (
          !node.contains(active) || (event.shiftKey ? active === first || active === root : active === last)
        ) {
          event.preventDefault()
          handOff(event.shiftKey ? last : first)
        }
      }

      const onPointerDown = (event: PointerEvent) => {
        if (!current.open || !current.dismissible || !topmost()) return
        if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return
        const target = event.target as Node | null
        if (target === null) return
        const content = document.getElementById(current.popupId)
        const inside = content === null ? target !== node && node.contains(target) : content.contains(target)
        // A press on a trigger is the trigger's.
        if (inside || onTrigger(target)) return
        send(Message.PressedOutside({ pointerType: event.pointerType }))
      }

      const onFocusIn = (event: FocusEvent) => {
        const target = event.target as Node | null
        focusInside = target !== null && node.contains(target)
        if (focusInside) lastFocused = target as HTMLElement
        // The browser keeps focus in a modal.
        if (focusInside || target === null || current.modal === true || !current.open) return
        if (!topmost() || inDialogAbove(node, target)) return
        if (current.modal === "trap-focus") {
          handOff(popup())
        } else if (current.dismissible && handingOff === 0 && !onTrigger(target)) {
          send(Message.FocusedOutside())
        }
      }

      // A modal whose consumer refused Escape until the browser closed it
      // anyway. The cancel was reported; the close isn't. The host shows the
      // dialog again, which moves focus to its first field, so focus goes back
      // to where it was.
      let restore: HTMLElement | null = null
      const onCancel = (event: Event) => {
        if (event.target === node && !event.cancelable && current.open) restore = lastFocused
      }
      const onClose = (event: Event) => {
        if (event.target !== node || restore === null) return
        const element = restore
        restore = null
        let tries = 0
        const refocus = () => {
          if (!current.open || !node.isConnected) return
          if (!node.open) {
            if (++tries < 10) frame(refocus)
            return
          }
          if (element.isConnected && node.contains(element)) handOff(element)
        }
        frame(refocus)
      }

      // A transition's end: the next frame, once what it started has finished.
      // A newer change makes an older wait stale. A closed dialog held by
      // `holdExit` waits for the consumer.
      let generation = 0
      const settle = (open: boolean) => {
        const mine = ++generation
        frame(() => {
          const running = node.getAnimations({ subtree: true }).filter(finite).map((animation) => animation.finished)
          Promise.allSettled(running).then(() => {
            if (mine === generation && node.isConnected) send(Message.FinishedTransition({ open }))
          })
        })
      }
      const onChange = (next: TrackDialogArgs) => {
        const previous = current
        current = next
        if (next.open && next.triggerId !== previous.triggerId) trigger = findTrigger() ?? trigger
        if (next.open && next.mounted && !previous.mounted) settle(true)
        else if (!next.open && next.mounted && next.holdExit) generation++
        else if (!next.open && next.mounted && (previous.open || !previous.mounted || previous.holdExit)) settle(false)
        else if (next.open && !previous.open && previous.mounted) generation++
      }

      return Effect.acquireRelease(
        Effect.sync(() => {
          showing.push(entry)
          document.addEventListener("keydown", onKeyDown)
          document.addEventListener("pointerdown", onPointerDown, true)
          document.addEventListener("focusin", onFocusIn, true)
          node.addEventListener("cancel", onCancel)
          node.addEventListener("close", onClose)
          const unlock = args.modal === true ? lockScroll(document) : undefined
          // The browser focuses a dialog when it shows, each its own way.
          // Ours comes after it, the frame the host showed it in.
          // Of dialogs opening together, the one on top takes focus.
          frame(() => {
            if (current.open && topmost()) focusFirst()
            focusInside = node.contains(document.activeElement)
            if (focusInside) lastFocused = document.activeElement as HTMLElement
            if (!current.mounted) frame(() => send(Message.RenderedFirstFrame()))
          })
          return unlock
        }).pipe(
          Effect.tap(() => Effect.forkScoped(Stream.runForEach(changes, (next) => Effect.sync(() => onChange(next)))))
        ),
        (unlock) =>
          Effect.sync(() => {
            showing.splice(showing.indexOf(entry), 1)
            document.removeEventListener("keydown", onKeyDown)
            document.removeEventListener("pointerdown", onPointerDown, true)
            document.removeEventListener("focusin", onFocusIn, true)
            node.removeEventListener("cancel", onCancel)
            node.removeEventListener("close", onClose)
            unlock?.()
            generation++
            if (!focusInside) return
            const { finalFocus, portalId } = current
            // The host closes the dialog at this commit, and a modal's close
            // moves focus back where it was before it opened. Then the dialog
            // decides.
            frame(() => {
              const active = document.activeElement as HTMLElement | null
              if (!finalFocus) {
                if (active !== null && active !== document.body) active.blur()
                return
              }
              const target = document.querySelector<HTMLElement>(
                `[data-final-focus="${CSS.escape(portalId)}"]`
              ) ?? trigger
              if (target?.isConnected === true) handOff(target)
            })
          })
      )
    })
)

// A builder that takes attributes: an element's, or the one a part is given.
interface Attributed<B> {
  readonly attr: (name: string, value: string | undefined) => B
}

// What marks a trigger, the dialog's own part and a `DialogTrigger` alike:
// the dialog's mount finds both by these. `active`: the dialog is open for
// this trigger.
const triggerAttrs = <B extends Attributed<B>>(builder: B, active: boolean, popupId: string | undefined): B =>
  builder
    .attr("aria-haspopup", "dialog")
    .attr("aria-expanded", active ? "true" : "false")
    .attr("aria-controls", active ? popupId : undefined)
    .attr("data-popup-open", flag(active))
    .attr("data-dialog-trigger", popupId)

// The `id` a builder had when a part was applied to it.
const idOf = (builder: unknown): string | null => {
  const id = (builder as { readonly attrs?: Readonly<Record<string, string>> | undefined }).attrs?.id
  return id === undefined || id === "" ? null : id
}

/**
 * A press on a `DialogTrigger`: the trigger's `id`, if it has one, and how
 * the user pressed it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface DialogTriggerPress {
  readonly triggerId: string | null
  readonly method: DialogInteraction
}

/**
 * A `<button>` builder: what `DialogTrigger` accepts as `element`, from the
 * caller's `h.button`, and what it returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogTriggerElement<Msg, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>

/**
 * A button that opens a dialog drawn somewhere else, such as in another
 * component. Call it with the caller's `h`, whether the dialog is open for
 * this trigger, the dialog's `id` as `popupId`, and what a press sends as
 * `onPress`, then chain the label.
 *
 * **Details**
 *
 * It sets the trigger's `aria-haspopup="dialog"`, `aria-expanded`,
 * `data-popup-open`, and `aria-controls` while the dialog is open, in
 * `forward`, so they win over the caller's. Give the dialog the same `id`
 * prop: the dialog then finds the trigger by its `aria-controls`, so a press
 * on it isn't a press outside, and focus goes back to it when the dialog
 * closes.
 *
 * `onPress` is a message, or a function of the press, which carries the
 * trigger's `id` and how the user pressed it. Store the method and pass it
 * as the dialog's `openMethod`, so an open by touch focuses the popup.
 *
 * Given `onPress`, a click handler of the caller's own, set on `element` or
 * chained after the call, throws at render: pass the message as `onPress`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const DialogTrigger = <Msg, R = never>(
  h: { readonly button: DialogTriggerElement<Msg> },
  options: {
    /** The caller's `h.button`, to stack a part on it. `h.button` when left out. */
    readonly element?: DialogTriggerElement<Msg, R> | undefined
    readonly props: {
      readonly open: boolean
      /** The dialog's `id`, which `aria-controls` points at while it is open. */
      readonly popupId?: string | undefined
    }
    /** What a press sends, with a click, Space or Enter. */
    readonly onPress?: NoInfer<Msg> | ((press: DialogTriggerPress) => NoInfer<Msg>) | undefined
  }
): DialogTriggerElement<Msg, R> => {
  const element: DialogTriggerElement<Msg, R> = options.element ?? h.button
  const { onPress } = options
  const { open, popupId } = options.props
  return element.forward((node) => {
    if (onPress !== undefined && node.handlers.click !== undefined) {
      throw new Error(
        "DialogTrigger: the element already handles click, which DialogTrigger would replace. Send the message from onPress"
      )
    }
    const button = triggerAttrs(node, open, popupId)
    if (onPress === undefined) return button
    if (typeof onPress !== "function") return button.onClick(onPress)
    const triggerId = idOf(node)
    const press = onPress as (press: DialogTriggerPress) => Msg
    return button.onClick(({ pointerType }) => press({ triggerId, method: methodOf(pointerType) }))
  })
}

/**
 * A headless dialog. Call it with the consumer's `h` and a `view` closure that
 * draws the trigger with `dialog.trigger` and the dialog with `dialog.portal` and the
 * parts inside it.
 *
 * **Details**
 *
 * The parts also return plain values for markup that depends on them:
 * `open`, `mounted` (the dialog shows, through its exit transition),
 * `transitionStatus`, `nested`, `nestedDialogs`, and `openMethod` and
 * `closeMethod`, how the user last opened and closed it. Draw `initialFocus` on
 * a field only for some ways of opening by branching on `dialog.openMethod`.
 *
 * A trigger reports its `id` in `Opened`: set it on the builder before the
 * part, `dialog.trigger(h.button.attr("id", "edit-" + row.id))`. Pressing the
 * trigger the dialog is open for asks it to close, and pressing another one
 * asks it to open for that one.
 *
 * Each part's attributes win over the ones the consumer set on the builder
 * it passes in, including the ones a state leaves absent: on the trigger
 * `aria-haspopup`, `aria-expanded`, `aria-controls`, `data-popup-open`, and
 * `data-dialog-trigger`, which the dialog tells its triggers by; on the
 * portal `id`, `aria-modal`, `popover` and `open`; `role` on the backdrop;
 * the data attributes on the backdrop, viewport and popup; `id` and `tabindex`
 * on the popup; `id` on the title and description; `autofocus` on
 * `initialFocus`; and `data-final-focus`, which the dialog finds the element
 * by, on `finalFocus`. The portal's `aria-labelledby` and `aria-describedby`
 * add to the consumer's. The portal's box and the popup's `--nested-dialogs`
 * are added after the consumer's inline style. A handler the consumer adds
 * to a part runs after the dialog's own.
 *
 * On the server and on a host that doesn't run mounts, a modal renders
 * closed, and the dialog stays at `data-starting-style` and closes without
 * waiting for a transition.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Dialog = Component.define({
  name: "Dialog",
  scoped: false,
  props: DialogProps,
  model: Model,
  message: Message,
  events: DialogEvents,
  // A dialog inside this one reads it and reports how many dialogs are open
  // in and below it.
  shares: {
    value: (_, props) => ({ open: props.open }),
    collects: {
      schema: Schema.Number,
      onChange: (counts) => Message.ChangedNested({ count: counts.reduce((sum, count) => sum + count, 0) })
    }
  },
  shared: {
    parent: {
      owner: "self",
      optional: true,
      report: (model, props) => (props.open ? 1 + model.nestedOpen : 0)
    }
  },
  elements: Html
}).make({
  init: () => ({ mounted: false, nestedOpen: 0, forcedClose: false, openMethod: null, closeMethod: null }),
  update: {
    ClickedTrigger: (model, { pointerType, triggerId }, $) => {
      const method = methodOf(pointerType)
      if ($.props.open && ($.props.triggerId == null || $.props.triggerId === triggerId)) {
        return dismiss(model, $, "trigger-press", method)
      }
      return $.set({ ...model, openMethod: method }).emit(DialogEvents.Opened({ triggerId }))
    },
    ClickedClose: (model, { pointerType }, $) =>
      $.props.open ? dismiss(model, $, "close-press", methodOf(pointerType)) : model,
    CancelledModal: (model, { forced }, $) => {
      const next = { ...model, forcedClose: forced }
      return $.props.open && topmost(model)
        ? $.set({ ...next, closeMethod: "keyboard" }).emit(DialogEvents.Dismissed({ reason: "escape-key" }))
        : next
    },
    // Every close comes here, the consumer's included. One while `open` still
    // says true is the browser's: after a request it wouldn't let be
    // cancelled, which was reported, or a close without one, which wasn't.
    ClosedModal: (model, _message, $) =>
      model.forcedClose
        ? { ...model, forcedClose: false }
        : $.props.open
        ? dismiss(model, $, "escape-key", "keyboard")
        : model,
    PressedEscape: (model, _message, $) =>
      $.props.open && topmost(model) ? dismiss(model, $, "escape-key", "keyboard") : model,
    PressedOutside: (model, { pointerType }, $) =>
      $.props.open && topmost(model) && $.props.disablePointerDismissal !== true
        ? dismiss(model, $, "outside-press", methodOf(pointerType))
        : model,
    FocusedOutside: (model, _message, $) =>
      $.props.open && topmost(model) && $.props.modal === false && $.props.disablePointerDismissal !== true
        ? dismiss(model, $, "focus-out", null)
        : model,
    RenderedFirstFrame: (model, _message, $) => $.props.open && !model.mounted ? { ...model, mounted: true } : model,
    FinishedTransition: (model, { open }, $) => {
      if (open !== $.props.open) return model
      if (open) return $.set(model).emit(DialogEvents.Settled({ open }))
      return model.mounted && $.props.holdExit !== true
        ? $.set({ ...model, mounted: false }).emit(DialogEvents.Settled({ open }))
        : model
    },
    ChangedNested: (model, { count }) => ({ ...model, nestedOpen: count })
  },
  parts: (model, p) => {
    const props = p.props
    const modal = props.modal ?? true
    const open = props.open
    const shown = open || model.mounted
    const transitionStatus = statusOf(model, props)
    const nested = p.shared.parent !== undefined
    const nestedDialogs = model.nestedOpen
    const portalId = props.id ?? p.id("portal")
    const openMethod = props.openMethod ?? model.openMethod
    const popupId = p.id("popup")
    const titleId = p.id("title")
    const descriptionId = p.id("description")
    // An attribute a part sets to `undefined` is removed from the consumer's
    // builder too, so a consumer's `data-open` can't report a state the
    // dialog isn't in.
    const states = <B extends Attributed<B>>(builder: B): B =>
      builder
        .attr("data-open", flag(open))
        .attr("data-closed", flag(!open))
        .attr("data-starting-style", flag(transitionStatus === "starting"))
        .attr("data-ending-style", flag(transitionStatus === "ending"))
    const nesting = <B extends Attributed<B>>(builder: B): B =>
      states(builder)
        .attr("data-nested", flag(nested))
        .attr("data-nested-dialog-open", flag(nestedDialogs > 0))

    const triggerPart = p.part("button", (b, triggerId: string | null) => {
      const active = open && (props.triggerId == null || props.triggerId === triggerId)
      return triggerAttrs(b, active, portalId)
        .onClick(({ pointerType }) => Message.ClickedTrigger({ triggerId, pointerType }))
    })
    const trigger = View.wrapPart(
      triggerPart,
      <B extends View.PartTarget<"button">>(element: B): ReturnType<B["attr"]> => triggerPart(element, idOf(element))
    )

    const portalPart = p.part("dialog", (b) => {
      const dialog = b
        .attr("id", portalId)
        .attr("aria-labelledby", titleId)
        .attr("aria-describedby", descriptionId)
        .attr("aria-modal", modal === "trap-focus" ? "true" : undefined)
        .forward((node) => node.attr("style", withStyle(node.attrs.style, portalBox)))
      // A modal is the browser's; the other modes are a manual popover, which
      // shows in the top layer without making the page inert.
      const placed = modal === true
        // A test host's cancel may carry no payload: only `false` is forced.
        ? dialog.attr("popover", undefined).modal(shown)
          .onCancel(({ cancelable }) => Message.CancelledModal({ forced: cancelable === false }))
          .onClose(Message.ClosedModal())
        : dialog.open(false).popover("manual", shown)
      if (!shown) return placed
      return placed.onMount(
        TrackDialog({
          modal,
          open,
          mounted: model.mounted,
          topmost: nestedDialogs === 0,
          dismissible: props.disablePointerDismissal !== true,
          initialFocus: props.initialFocus !== false,
          finalFocus: props.finalFocus !== false,
          openMethod,
          triggerId: props.triggerId ?? null,
          holdExit: props.holdExit === true,
          portalId,
          popupId
        })
      )
    })
    // Applied before deciding, so a wrong tag throws in every state.
    const portal = View.wrapPart(
      portalPart,
      <B extends View.PartTarget<"dialog">>(element: B): ReturnType<B["attr"]> | undefined => {
        const out = portalPart(element)
        return shown || props.keepMounted === true ? out : undefined
      }
    )

    const backdropPart = p.part("div", (b) => states(b).attr("role", "presentation"))
    const backdrop = View.wrapPart(
      backdropPart,
      <B extends View.PartTarget<"div">>(element: B): ReturnType<B["attr"]> | undefined => {
        const out = backdropPart(element)
        return nested && props.forceRenderBackdrop !== true ? undefined : out
      }
    )
    const viewport = p.part("div", nesting)
    const popup = p.part("div", (b) =>
      nesting(b)
        .attr("id", popupId)
        .attr("tabindex", "-1")
        .forward((node) => node.attr("style", withStyle(node.attrs.style, `--nested-dialogs:${nestedDialogs}`))))
    const title = p.part(["h1", "h2", "h3", "h4", "h5", "h6"], (b) => b.attr("id", titleId))
    const description = p.part("p", (b) => b.attr("id", descriptionId))
    const close = p.part(
      "button",
      (b) => b.onClick(({ pointerType }) => Message.ClickedClose({ pointerType }))
    )
    const initialFocus = p.part((b) => b.attr("autofocus", props.initialFocus === false ? undefined : ""))
    const finalFocus = p.part((b) => b.attr("data-final-focus", portalId))
    return {
      open,
      mounted: shown,
      transitionStatus,
      nested,
      nestedDialogs,
      openMethod,
      closeMethod: model.closeMethod,
      trigger,
      portal,
      backdrop,
      viewport,
      popup,
      title,
      description,
      close,
      initialFocus,
      finalFocus
    }
  }
})
