/**
 * The HTML element vocabulary for `@effect/ui`: element names on `h`, typed
 * events with plain payloads, controlled properties, refs typed by tag, and
 * ref Commands.
 *
 * The module is itself a vocabulary. Register it once for the app by
 * importing `@effect/ui/html/register`, or set it on one component with
 * `elements: Html`.
 *
 * Event handlers get plain data, never a DOM event: `input` is `{ value }`,
 * `keydown` is `{ key, shift, ctrl, alt, meta, composing }` and `submit` is
 * `{ fields }`. A handler set with `{ preventDefault: true }` cancels the
 * browser's default when it produces a message and leaves it alone when it
 * returns `undefined`, so it decides per event. A form's `submit` is always
 * cancelled, with or without a handler. Nothing stops an event's propagation:
 * only the innermost element with a handler for an event gets it.
 *
 * Drag and drop is declared, not handled: `draggable(data)` makes a drag
 * source and `onDrop(handler, { accepts })` a drop target, and the host does
 * the browser's part. Enter and leave go to the active drop target only, not
 * to every element the pointer crosses as `mouseenter` does. Drag and drop
 * needs a pointer, so give every drag a button or menu that sends the same
 * message.
 *
 * `value`, `checked`, `selected` and `open` are controlled: the host puts the
 * Model's value back after every patch and after every event that could have
 * changed it, so the element always shows what the Model says.
 *
 * A `dialog` is closed, open, or open as a modal: `.open(b)` and `.modal(b)`
 * set the same state, and the last call wins. A modal's close requests, such
 * as Escape, come to `onCancel`, and it closes when the Model says so. Forms
 * in a dialog are the app's like any other, so read the choice in
 * `onSubmit`, not `returnValue`.
 *
 * Any element can be a popover with `.popover(mode, open)`, its state
 * separate from a `dialog`'s or `details`'s `open`. A `"manual"` popover is
 * controlled by the Model. An `"auto"` popover is followed: the browser
 * closes it on Escape, a click outside or another popover opening, `onToggle`
 * reports it, and the Model must follow. Position a popover next to its
 * trigger with CSS anchor positioning.
 *
 * **Example** (Registering the vocabulary for the app)
 *
 * ```ts
 * import "@effect/ui/html/register"
 * ```
 *
 * **Example** (A controlled text field)
 *
 * ```ts import.meta.vitest
 * import { Html } from "@effect/ui/html"
 * import { Schema } from "effect"
 * import { Component, UiSchema } from "@effect/ui"
 *
 * const Message = UiSchema.TaggedEnum({ UpdatedDraft: { value: Schema.String }, SubmittedForm: {} })
 *
 * const NewTodo = Html.ref("NewTodo", "input")
 *
 * const Form = Component.define({
 *   name: "Form",
 *   model: Schema.String,
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => "",
 *   update: (draft, message) => (message._tag === "UpdatedDraft" ? message.value : ""),
 *   view: (draft, h) =>
 *     h.form.onSubmit(Message.SubmittedForm()).children(
 *       h.input.ref(NewTodo).attr("aria-label", "New todo").value(draft)
 *         .onInput(({ value }) => Message.UpdatedDraft({ value })),
 *       h.button.attr("type", "submit").children("Add")
 *     )
 * })
 * ```
 *
 * **Example** (Sending on Enter, keeping Shift+Enter's new line)
 *
 * ```ts import.meta.vitest
 * import { Html } from "@effect/ui/html"
 * import { Schema } from "effect"
 * import { Component, UiSchema } from "@effect/ui"
 *
 * const Message = UiSchema.TaggedEnum({ UpdatedDraft: { value: Schema.String }, PressedEnter: {} })
 *
 * const Composer = Component.define({
 *   name: "Composer",
 *   model: Schema.String,
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => "",
 *   update: (draft, message) => (message._tag === "UpdatedDraft" ? message.value : ""),
 *   view: (draft, h) =>
 *     h.textarea.attr("aria-label", "Message").value(draft)
 *       .onInput(({ value }) => Message.UpdatedDraft({ value }))
 *       // Enter that ends an IME composition only confirms the text.
 *       .onKeyDown(
 *         ({ key, shift, composing }) =>
 *           key === "Enter" && !shift && !composing ? Message.PressedEnter() : undefined,
 *         { preventDefault: true }
 *       )
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Command from "../Command.ts"
import type * as Component from "../Component.ts"
import * as services from "../internal/services.ts"
import type * as Mount from "../Mount.ts"
import * as Renderer from "../Renderer.ts"
import * as Subscription from "../Subscription.ts"
import * as View from "../View.ts"
import * as HtmlHead from "./HtmlHead.ts"
import * as globalEvents from "./internal/globalEvents.ts"

// ---------------------------------------------------------------------------
// host
// ---------------------------------------------------------------------------

/**
 * The HTML host marker: a host Layer that can show HTML elements provides it.
 *
 * **Details**
 *
 * `mount` requires it for an HTML root, so mounting one on another host is a
 * type error. It's a framework service, so a Command may use it without it
 * appearing in a component's requirements. It holds the element operations
 * the ref Commands use, which a test on `TestHost` fakes with
 * `Layer.succeed(Html.Host, ...)`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export class Host extends Context.Service<Host, {
  readonly focus: (element: globalThis.Element, options: { readonly preventScroll?: boolean | undefined }) => void
  readonly blur: (element: globalThis.Element) => void
  readonly scrollIntoView: (element: globalThis.Element, options: ScrollOptions) => void
  readonly measure: (element: globalThis.Element) => Rect
}>()("@effect/ui/html/Html/Host") {}

declare module "../Command.ts" {
  interface FrameworkServices {
    readonly HtmlHost: Host
  }
}

/**
 * An element's box, from `measure`, in CSS pixels relative to the viewport.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

/**
 * The options of `scrollIntoView`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ScrollOptions {
  readonly behavior?: "auto" | "instant" | "smooth" | undefined
  readonly block?: "start" | "center" | "end" | "nearest" | undefined
  readonly inline?: "start" | "center" | "end" | "nearest" | undefined
}

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

/**
 * What pressed an element: `"mouse"`, `"touch"` or `"pen"`, or `""` for a
 * click no pointer made, such as a button activated with Enter or Space.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export type PointerType = "mouse" | "touch" | "pen" | ""

/**
 * The payload of `click`, `dblclick`, `contextmenu`, `mousedown` and
 * `mouseup`: the button, the position in the viewport, the modifier keys,
 * and the kind of pointer.
 *
 * **Details**
 *
 * `pointerType` is `""` for a click from the keyboard or a script. Otherwise
 * the browser host reads it from the `pointerdown` before the event, since
 * some browsers report a tap's `click` as a mouse's. A browser that sends no
 * pointer events reports `"mouse"`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface PointerPayload {
  readonly button: number
  readonly x: number
  readonly y: number
  readonly shift: boolean
  readonly ctrl: boolean
  readonly alt: boolean
  readonly meta: boolean
  readonly pointerType: PointerType
}

/**
 * The payload of `keydown` and `keyup`. `composing` is true while an input
 * method composes text, including for the key that ends the composition, so
 * a handler for Enter can leave it to the input method.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface KeyPayload {
  readonly key: string
  readonly shift: boolean
  readonly ctrl: boolean
  readonly alt: boolean
  readonly meta: boolean
  readonly composing: boolean
}

/**
 * The payload of `input` and `change` on a `textarea` or `select`: the
 * value the user left in the element.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ValuePayload {
  readonly value: string
}

/**
 * The payload of `input` and `change` on an `input`: its value, and whether
 * it's checked (a checkbox or radio button).
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface InputPayload {
  readonly value: string
  readonly checked: boolean
}

/**
 * The payload of `submit`: the form's fields.
 *
 * **Details**
 *
 * `fields` holds the first value of each named field, and `entries` every
 * name and value in document order, for names used more than once. Files are
 * left out. The browser's own submission is always prevented.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface SubmitPayload {
  readonly fields: Readonly<Record<string, string>>
  readonly entries: ReadonlyArray<readonly [name: string, value: string]>
}

/**
 * The payload of `toggle` on a `details` or `dialog`: whether it's open now.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface TogglePayload {
  readonly open: boolean
}

/**
 * The payload of `toggle`, which any element can get as a popover: `open`
 * is whether it's showing now, and `newState` and `oldState` are what the
 * browser reported.
 *
 * **Details**
 *
 * Browsers coalesce the toggles queued for an element into one, from the
 * first change's `oldState` to the latest `newState`, so the two can be
 * equal, such as `"closed"` to `"closed"` for a popover shown and dismissed
 * before the event. `open` and `newState` are the state when it's sent;
 * follow them rather than the transition. On a `details` or `dialog`, a
 * browser without `ToggleEvent` gets states derived from `open`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface PopoverTogglePayload extends TogglePayload {
  readonly newState: "open" | "closed"
  readonly oldState: "open" | "closed"
}

/**
 * How a popover behaves, set with `popover`.
 *
 * **Details**
 *
 * A `"manual"` popover is controlled: it shows what the Model says, and the
 * browser host puts it back when anything else changes it. An `"auto"`
 * popover is followed: the browser closes it on Escape, a click outside,
 * another auto popover opening or a modal dialog opening, the host reports
 * that as `toggle`, and the Model must follow. The host shows or hides an
 * auto popover only when the Model's value changes, and never reverts the
 * browser.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export type PopoverMode = "manual" | "auto"

/**
 * The payload of `scroll`: the element's scroll offsets.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ScrollPayload {
  readonly top: number
  readonly left: number
}

/**
 * The payload of `drop`: the dragged strings by type, the dragged files, and
 * the pointer's position in the drop target's box, from its top-left corner,
 * with the box's size. `y < height / 2` tells the upper half from the lower.
 *
 * **Details**
 *
 * `data` holds every string type the drag carries, read when it's dropped,
 * since a browser hides them until then. `files` is empty unless the drag
 * carries files. A `File` isn't plain data: send it on to a Command, and keep
 * plain facts about it, such as its name and size, in the Model, which must
 * stay encodable.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface DropPayload {
  readonly data: Readonly<Record<string, string>>
  readonly files: ReadonlyArray<File>
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * The payload of `dragover`: the pointer's position in the drop target's box,
 * from its top-left corner, with the box's size.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface DragOverPayload {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * The payload of `dragend`, on the drag's source: whether the drag was
 * dropped, on one of the app's drop targets or anywhere the browser reports
 * it accepted, or was cancelled.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface DragEndPayload {
  readonly dropped: boolean
}

/**
 * What a drop does, as a drop target shows it with the pointer: `"copy"`,
 * `"move"` or `"link"`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export type DropEffect = "copy" | "move" | "link"

/**
 * The drop effects a drag source allows. A drop target whose `dropEffect` the
 * source doesn't allow can't take the drop.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export type EffectAllowed = "none" | "copy" | "copyLink" | "copyMove" | "link" | "linkMove" | "move" | "all"

/**
 * A drag source, set with `draggable`: the strings it carries by type, and
 * the drop effects it allows. Stored as the element's `dragstart` options.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface DragSourceOptions extends View.EventOptions {
  readonly data: Readonly<Record<string, string>>
  readonly effectAllowed?: EffectAllowed | undefined
}

/**
 * A drop target, set with `onDrop`: the drag types it accepts, matched without
 * case with `"Files"` for files, and the drop effect it shows. Stored as the
 * element's `drop` options.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface DropTargetOptions extends View.EventOptions {
  readonly accepts: ReadonlyArray<string>
  readonly dropEffect?: DropEffect | undefined
}

/**
 * The events every HTML element has, with their payloads.
 *
 * **Details**
 *
 * `focus`, `blur`, `mouseenter`, `mouseleave` and `scroll` don't bubble: only
 * the element they happen on gets them. The others go to the innermost element
 * with a handler, except the drop target's events: `dragenter`, `dragleave`,
 * `dragover` and `drop` go to the active drop target, as `onDrop` describes.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface Events {
  readonly click: PointerPayload
  readonly dblclick: PointerPayload
  readonly contextmenu: PointerPayload
  readonly mousedown: PointerPayload
  readonly mouseup: PointerPayload
  readonly mouseenter: {}
  readonly mouseleave: {}
  readonly keydown: KeyPayload
  readonly keyup: KeyPayload
  readonly focus: {}
  readonly blur: {}
  readonly focusin: {}
  readonly focusout: {}
  readonly scroll: ScrollPayload
  readonly dragstart: {}
  readonly dragend: DragEndPayload
  readonly dragenter: {}
  readonly dragleave: {}
  readonly dragover: DragOverPayload
  readonly drop: DropPayload
  readonly toggle: PopoverTogglePayload
}

/**
 * The events of one tag: the shared `Events` plus the tag's own.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export type EventsOf<K extends string> =
  & Events
  & (K extends "input" ? { readonly input: InputPayload; readonly change: InputPayload } : {})
  & (K extends "textarea" | "select" ? { readonly input: ValuePayload; readonly change: ValuePayload } : {})
  & (K extends "form" ? { readonly submit: SubmitPayload; readonly reset: {} } : {})
  & (K extends "details" ? { readonly toggle: TogglePayload } : {})
  & (K extends "dialog" ? {
      readonly toggle: TogglePayload
      readonly close: { readonly returnValue: string }
      readonly cancel: { readonly cancelable: boolean }
    }
    : {})
  & (K extends "img" | "iframe" | "video" | "audio" ? { readonly load: {}; readonly error: {} } : {})

// ---------------------------------------------------------------------------
// document and window events
// ---------------------------------------------------------------------------

/**
 * The events `onDocument` listens for, with their payloads: the same ones
 * an element's handler gets.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface DocumentEvents {
  readonly keydown: KeyPayload
  readonly keyup: KeyPayload
  readonly mousedown: PointerPayload
  readonly mouseup: PointerPayload
  readonly click: PointerPayload
}

/**
 * The events `onWindow` listens for, with their payloads.
 *
 * **Details**
 *
 * `focus` and `blur` don't bubble, so a listener in the bubble phase hears
 * only the window's own: the window gaining and losing focus, not an element
 * in it.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface WindowEvents {
  readonly focus: {}
  readonly blur: {}
}

/**
 * The payload of a document or window listener: the event's payload, and
 * whether something already cancelled the event's default.
 *
 * **Details**
 *
 * In the bubble phase `defaultPrevented` includes every element handler
 * set with `preventDefault`, since the host's own listeners run on the
 * document in the capture phase. In the capture phase it depends on the
 * order the listeners were added in, so don't read it there.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export type GlobalPayload<P> = P & { readonly defaultPrevented: boolean }

/**
 * The options of `onDocument` and `onWindow`: `preventDefault`, as on an
 * element's handler, and `capture`, to listen in the capture phase, before
 * any element sees the event, so a handler that stops it can't hide it.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface GlobalEventOptions extends View.EventOptions {
  readonly capture?: boolean | undefined
}

/**
 * The source of document and window events, which `onDocument` and
 * `onWindow` listen to.
 *
 * **Details**
 *
 * `listen` adds a listener to the host's `document` or its window and
 * returns the function that removes it. The listener gets the plain payload,
 * `defaultPrevented` included, and a function that cancels the event's
 * default.
 *
 * `BrowserHost.layer` provides the one over its `document` and that
 * document's `defaultView`, so an app in an iframe hears its own document.
 * The default never fires, so a host without a document, and a test that
 * doesn't fire events, need nothing. A test fires them with `HtmlScene`'s
 * `fireDocument` and `fireWindow`, or with `TestGlobalEvents` from
 * `@effect/ui/html/testing`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface GlobalEvents {
  readonly listen: (
    target: "document" | "window",
    event: string,
    options: { readonly capture: boolean },
    listener: (payload: unknown, preventDefault: () => void) => void
  ) => () => void
}

/**
 * The source of document and window events. It defaults to one that never
 * fires.
 *
 * @stability experimental
 * @category references
 * @since 0.1.0
 */
export const GlobalEvents: Context.Reference<GlobalEvents> = Context.Reference<GlobalEvents>(
  "@effect/ui/html/Html/GlobalEvents",
  { defaultValue: () => silent }
)

const silent: GlobalEvents = { listen: () => () => {} }

const listenFor = (
  target: "document" | "window",
  event: string,
  handler: View.Handler<unknown, any>,
  options: GlobalEventOptions | undefined
): Subscription.Subscription<any> => {
  const capture = options?.capture === true
  const declared: globalEvents.Listener = {
    target,
    event,
    capture,
    handler,
    preventDefault: options?.preventDefault
  }
  // The runtime attaches the listener here and runs no Stream, as for `Router.prefetch`. Each event
  // goes to the declaration the pending renders leave, and nowhere once they remove it.
  const direct: NonNullable<services.Direct[typeof services.direct]> = (context, emit, fail, enter) => ({
    initial: Effect.void,
    close: Context.get(context, GlobalEvents).listen(
      target,
      event,
      { capture },
      (payload, preventDefault) =>
        enter((latest) => {
          try {
            globalEvents.run(globalEvents.listenerOf(latest) ?? declared, payload, preventDefault, emit)
          } catch (error) {
            fail(Cause.die(error))
          }
        })
    )
  })
  return Object.assign(
    Subscription.make(`@effect/ui/html/${target}`, capture ? [event, "capture"] : [event], () => Stream.never),
    { [globalEvents.listener]: declared, [services.direct]: direct }
  )
}

/**
 * A Subscription that listens for an event on the host's document.
 *
 * **When to use**
 *
 * Use when the input is one no element of the component hears: a keyboard shortcut, a
 * game's arrow keys, a press outside a popup. Gate the entry on the Model,
 * so the listener exists only while it's wanted.
 *
 * **Details**
 *
 * `handler` is a message or a function of the payload, as on an element,
 * and the payload is plain data with `defaultPrevented` added. With
 * `preventDefault: true` the default is cancelled only when the handler
 * returns a message, and with `"always"` whatever it returns. `capture:
 * true` listens in the capture phase.
 *
 * The listener calls the handler of the latest `subscriptions` result, so a
 * handler that reads the Model sees the current one. The source is
 * `GlobalEvents`, which `BrowserHost.layer` provides, so nothing listens on
 * the server and a test fires the event without a document.
 *
 * The key is `@effect/ui/html/document` with the event as its dep, and
 * `"capture"` after it for a capture listener:
 * `@effect/ui/html/document:"keydown"`. An instance has one listener per
 * event and phase. Listing a second fails the instance as a duplicate key,
 * so put both cases in one handler.
 *
 * **Example** (Steering with the arrow keys while the game runs)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Direction = Schema.Literals(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])
 * const Message = UiSchema.TaggedEnum({ PressedArrow: { key: Direction } })
 *
 * const Snake = Component.define({
 *   name: "Snake",
 *   model: Schema.Struct({ running: Schema.Boolean, heading: Direction }),
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => ({ running: true, heading: "ArrowRight" as const }),
 *   update: { PressedArrow: (model, { key }) => ({ ...model, heading: key }) },
 *   view: (model, h) => h.p(model.heading),
 *   subscriptions: (model) => [
 *     model.running && Html.onDocument(
 *       "keydown",
 *       // The page doesn't scroll on an arrow key, and other keys keep their default.
 *       ({ key }) => Schema.is(Direction)(key) ? Message.PressedArrow({ key }) : undefined,
 *       { preventDefault: true }
 *     )
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(Snake, {})
 *   s.fireDocument("keydown", { key: "ArrowUp" })
 *     .expectDefaultPrevented()
 *     .expect(Locator.text("ArrowUp")).toExist()
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onDocument = <K extends keyof DocumentEvents, Msg>(
  event: K,
  handler: View.Handler<Msg, GlobalPayload<DocumentEvents[K]>>,
  options?: GlobalEventOptions | undefined
): Subscription.Subscription<Msg> => listenFor("document", event, handler, options)

/**
 * A Subscription that listens for an event on the host's window.
 *
 * **Details**
 *
 * It works as `onDocument` does, with the key `@effect/ui/html/window`.
 * Its events are the window's `focus` and `blur`, such as to pause a timer
 * while the user is in another window.
 *
 * **Example** (Following the window's focus)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html } from "@effect/ui/html"
 *
 * const Message = UiSchema.TaggedEnum({ FocusedWindow: {}, BlurredWindow: {} })
 *
 * const subscriptions = () => [
 *   Html.onWindow("focus", Message.FocusedWindow()),
 *   Html.onWindow("blur", Message.BlurredWindow())
 * ]
 *
 * subscriptions().map((subscription) => subscription.key) // => ['@effect/ui/html/window:"focus"', '@effect/ui/html/window:"blur"']
 * ```
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onWindow = <K extends keyof WindowEvents, Msg>(
  event: K,
  handler: View.Handler<Msg, GlobalPayload<WindowEvents[K]>>,
  options?: GlobalEventOptions | undefined
): Subscription.Subscription<Msg> => listenFor("window", event, handler, options)

// ---------------------------------------------------------------------------
// images
// ---------------------------------------------------------------------------

/**
 * An image to load, as the `<img>` attributes of the same names.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ImageSource {
  readonly src?: string | undefined
  readonly srcSet?: string | undefined
  readonly sizes?: string | undefined
  readonly crossOrigin?: "anonymous" | "use-credentials" | undefined
  readonly referrerPolicy?: string | undefined
}

/**
 * Loads images the page doesn't show, such as to show an `<img>` only once
 * its source has loaded.
 *
 * **Details**
 *
 * `load` settles with `"loaded"` or `"error"`, and interrupting it drops
 * the load. `BrowserHost.layer` provides one that loads in a detached
 * `<img>` of its document. The default never settles, so on a host without
 * a document an image stays loading. A test settles loads with `TestImages`
 * from `@effect/ui/html/testing`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface Images {
  readonly load: (source: ImageSource) => Effect.Effect<"loaded" | "error">
}

/**
 * The image loader. It defaults to one whose loads never settle.
 *
 * @stability experimental
 * @category references
 * @since 0.1.0
 */
export const Images: Context.Reference<Images> = Context.Reference<Images>(
  "@effect/ui/html/Html/Images",
  { defaultValue: () => pending }
)

const pending: Images = { load: () => Effect.never }

// ---------------------------------------------------------------------------
// elements
// ---------------------------------------------------------------------------

/**
 * The nodes whose `value` is controlled.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ValueNode = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

/**
 * The builder of a void HTML element, such as `h.input` or `h.br`: the core
 * builder plus typed event sugar, controlled properties and a few attribute
 * helpers, and no children. `Element` adds `children` for the other tags.
 *
 * **Details**
 *
 * `Events` are the tag's events, `Node` the DOM element it renders to,
 * which types `ref` and `onMount`, and `Tag` the tag, which a part of a
 * headless component checks. Every method returns a copy. A builder
 * is itself a valid child or view, so `h.input.value(draft)` needs no
 * terminal call.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class VoidElement<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  in out Node = unknown,
  out Tag extends string = string
> extends View.ElementBuilder<Msg, R, E, Node, Tag> {
  /**
   * Like `View.ElementBuilder.onMount`, keeping the HTML methods.
   *
   * @since 0.1.0
   */
  override onMount<R2>(
    mount: Mount.Issued<Msg | Component.Noop, R2, Node, never>
  ): VoidElement<Msg, R | R2, E, Node, Tag>
  /**
   * Rejects any other mount result, with a type error that says what to end
   * it with.
   *
   * @since 0.1.0
   */
  override onMount(mount: Mount.Issued<Msg | Component.Noop | View.MountHint, any, Node, never>): never
  override onMount(mount: View.Mount<Msg>): any {
    return (super.onMount as any)(mount)
  }
  /**
   * Like `View.ElementBuilder.forward`, keeping the HTML methods.
   *
   * @since 0.1.0
   */
  override forward<R2 = never>(
    place: (
      node: VoidElement<Msg, R, E, Node, Tag>
    ) => View.Element<Msg, R2> | View.ElementBuilder<Msg, R2, any, any>
  ): VoidElement<Msg, R | R2, E, Node, Tag> {
    return View.withForward(this, place) as any
  }
  /**
   * Sets the `id` attribute.
   *
   * @since 0.1.0
   */
  id(id: string): this {
    return this.attr("id", id)
  }
  /**
   * Sets inline CSS from camelCase properties and `--custom` properties.
   *
   * **Details**
   *
   * Values are strings with explicit units. Skips `false`, `null`, `undefined`
   * and `""`. Each call replaces the previous style; an empty result removes
   * the attribute. Merge objects with spread to keep earlier declarations.
   * Raw CSS text can still be set with `attr("style", text)`.
   *
   * This writes the whole attribute, so styles set by `onMount` are lost when
   * the style text changes. A Content Security Policy must allow inline style
   * attributes (for example, `style-src-attr 'unsafe-inline'`). Values are not
   * parsed: a semicolon can start another declaration. Do not pass untrusted
   * input as a raw value.
   *
   * **Example** (Defining inline styles)
   *
   * ```ts
   * import type { Html } from "@effect/ui/html"
   *
   * declare const h: Html.Tags<never>
   * declare const model: { readonly error: string | undefined }
   *
   * const note = h.div.style({
   *   color: model.error !== undefined && "red",
   *   marginTop: "1rem",
   *   "--accent": "#09f"
   * }).children("Note")
   * ```
   *
   * @since 0.1.0
   */
  style(style: Style): this {
    const declarations: Array<string> = []
    for (const [name, value] of Object.entries(style)) {
      if (!value) continue
      const property = name.startsWith("--")
        ? name
        : name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase()).replace(/^(webkit|moz|ms)-/, "-$1-")
      declarations.push(property + ":" + value)
    }
    return this.attr("style", declarations.length === 0 ? undefined : declarations.join(";"))
  }
  /**
   * Sets the `class` attribute from class tokens, skipping `false`, `null`,
   * `undefined` and `""`.
   *
   * **Details**
   *
   * The remaining tokens are joined with one space, as `classNames` does.
   * When none remain, the attribute is removed instead of rendering
   * `class=""`. Calling `class` again replaces the earlier value.
   *
   * **Example** (Adding classes conditionally)
   *
   * ```ts
   * import type { Html } from "@effect/ui/html"
   *
   * declare const h: Html.Tags<never>
   * declare const model: { readonly saving: boolean; readonly error: string | undefined }
   *
   * const save = h.button.class(
   *   "rounded px-3 py-1",
   *   model.saving && "opacity-50",
   *   model.error !== undefined && "ring-2 ring-red-500"
   * ).children("Save")
   * ```
   *
   * @since 0.1.0
   */
  class(...tokens: ReadonlyArray<ClassToken>): this {
    // One token, the common call, is the value as it is.
    const value = tokens.length === 1 ? tokens[0] || "" : joinClassTokens(tokens)
    return this.attr("class", value === "" ? undefined : value)
  }
  /**
   * Sets or removes the `disabled` boolean attribute.
   *
   * @since 0.1.0
   */
  disabled(disabled: boolean): this {
    return this.attr("disabled", disabled ? "" : undefined)
  }
  /**
   * The controlled `value` of an `input`, `textarea` or `select`. The element
   * always shows it, whatever the user types, until the Model changes.
   *
   * @since 0.1.0
   */
  value<N extends ValueNode>(this: VoidElement<Msg, R, E, N>, value: string): this {
    return this.prop("value", value) as any
  }
  /**
   * The controlled `checked` state of a checkbox or radio button.
   *
   * @since 0.1.0
   */
  checked(this: VoidElement<Msg, R, E, HTMLInputElement>, checked: boolean): this {
    return this.prop("checked", checked) as any
  }
  /**
   * The controlled `selected` state of an `option`.
   *
   * @since 0.1.0
   */
  selected(this: VoidElement<Msg, R, E, HTMLOptionElement>, selected: boolean): this {
    return this.prop("selected", selected) as any
  }
  /**
   * The controlled `open` state of a `details` or `dialog`. On a `dialog`
   * it shows a non-modal dialog. `open` and `modal` set the same state, and
   * the last call wins.
   *
   * @since 0.1.0
   */
  open<N extends HTMLDetailsElement | HTMLDialogElement>(this: VoidElement<Msg, R, E, N>, open: boolean): this {
    return this.prop("open", open) as any
  }
  /**
   * Shows a `dialog` as a modal while `modal` is true: in the top layer, with
   * a backdrop, the rest of the page inert and focus kept inside, and closed
   * otherwise. `open` and `modal` set the same state, `false`, `true` or
   * `"modal"`, and the last call wins.
   *
   * **Details**
   *
   * The Model decides when the modal closes. The browser host cancels its
   * close requests, such as Escape and, where `closedby` is supported, a
   * click on the backdrop, and sends them as `onCancel`; a modal without
   * `onCancel` ignores them. Browsers may still close a modal whose close
   * requests keep being cancelled: Chromium 153 did after one or two
   * cancelled Escapes, depending on user activation, and other browsers may
   * differ. When the Model still says `true`, the host shows it again on the
   * next frame, which moves focus to the dialog's first focusable element.
   *
   * A form in the dialog is the app's, like any other: its submission comes
   * to `onSubmit`, with the submitter's `name` and `value` in `entries`, and
   * `method="dialog"` neither closes the dialog nor sets `returnValue`.
   * `onClose` is sent for every close, the Model's included, except the
   * closes the host makes to switch between modal and non-modal.
   *
   * The server renders a modal dialog closed, since HTML has no attribute
   * for one, and the browser host shows it once the page is live.
   *
   * @since 0.1.0
   */
  modal<N extends HTMLDialogElement>(this: VoidElement<Msg, R, E, N>, modal: boolean): this {
    return this.prop("open", modal ? "modal" : false) as any
  }
  /**
   * Makes this element a popover in the top layer, `"manual"` or `"auto"`,
   * showing while `open` is true. Its state is its own, separate from a
   * `details` or `dialog`'s `open`. The last call wins.
   *
   * **Details**
   *
   * A `"manual"` popover is controlled: the browser host shows and hides it
   * as the Model says at every commit, whether or not its component
   * rendered, and when anything else changes it, such as a `popovertarget`
   * button, puts it back on the next frame. Use `onClick` to open it.
   *
   * An `"auto"` popover is followed: the browser closes it on Escape, a
   * click outside, another auto popover opening or a modal dialog opening,
   * and sends `onToggle`. The Model must follow it. The host shows or hides
   * it only when the Model's value changes, so a Model that ignores the
   * toggle still says open while the popover is closed, and it reopens only
   * once the value goes to `false` and back. The same holds when the
   * browser closes it without a `toggle`, as it does when the element moves
   * in the document. `popovertarget` and `commandfor` buttons work with an
   * auto popover.
   *
   * The server renders a popover closed, and the browser host shows it at
   * the first commit once the page is live. A popover removed while showing
   * closes without a `toggle`.
   *
   * @since 0.1.0
   */
  popover(mode: PopoverMode, open: boolean): this {
    return this.attr("popover", mode).prop("popoverOpen", open)
  }
  /**
   * Sugar for `on("click", handler, options)`.
   *
   * @since 0.1.0
   */
  onClick(handler: View.Handler<Msg, PointerPayload>, options?: View.EventOptions | undefined): this {
    return this.on("click" as any, handler as any, options)
  }
  /**
   * Sugar for `on("dblclick", handler, options)`.
   *
   * @since 0.1.0
   */
  onDoubleClick(handler: View.Handler<Msg, PointerPayload>, options?: View.EventOptions | undefined): this {
    return this.on("dblclick" as any, handler as any, options)
  }
  /**
   * Sugar for `on("keydown", handler, options)`.
   *
   * @since 0.1.0
   */
  onKeyDown(handler: View.Handler<Msg, KeyPayload>, options?: View.EventOptions | undefined): this {
    return this.on("keydown" as any, handler as any, options)
  }
  /**
   * Sugar for `on("keyup", handler, options)`.
   *
   * @since 0.1.0
   */
  onKeyUp(handler: View.Handler<Msg, KeyPayload>, options?: View.EventOptions | undefined): this {
    return this.on("keyup" as any, handler as any, options)
  }
  /**
   * Sugar for `on("focus", handler)`.
   *
   * @since 0.1.0
   */
  onFocus(handler: View.Handler<Msg, {}>): this {
    return this.on("focus" as any, handler as any)
  }
  /**
   * Sugar for `on("blur", handler)`.
   *
   * @since 0.1.0
   */
  onBlur(handler: View.Handler<Msg, {}>): this {
    return this.on("blur" as any, handler as any)
  }
  /**
   * Makes this element a drag source carrying `data`, strings by type such
   * as `{ "application/x-todo": id }`, and sets `draggable="true"`. The host
   * puts the data on the drag when it starts. Calling it again replaces the
   * data; it keeps an `onDragStart` handler, in either order.
   *
   * @since 0.1.0
   */
  draggable(
    data: Readonly<Record<string, string>>,
    options?: { readonly effectAllowed?: EffectAllowed | undefined } | undefined
  ): this {
    const source: DragSourceOptions = { data, effectAllowed: options?.effectAllowed }
    return View.withFields(this, { eventOptions: { ...this.eventOptions, dragstart: source } }).attr(
      "draggable",
      "true"
    )
  }
  /**
   * Sugar for `on("dragstart", handler)` that keeps the data set with
   * `draggable`, in either order.
   *
   * @since 0.1.0
   */
  onDragStart(handler: View.Handler<Msg, {}>): this {
    return this.on("dragstart" as any, handler as any, this.eventOptions.dragstart)
  }
  /**
   * Sugar for `on("dragend", handler)`, on the drag's source: `dropped` is
   * false when the drag was cancelled.
   *
   * @since 0.1.0
   */
  onDragEnd(handler: View.Handler<Msg, DragEndPayload>): this {
    return this.on("dragend" as any, handler as any)
  }
  /**
   * Makes this element a drop target for drags carrying one of the
   * `accepts` types, and sends the drop.
   *
   * **Details**
   *
   * While an accepted drag is over the target, the host cancels `dragenter`
   * and `dragover` so the browser allows the drop, and shows `dropEffect`. A
   * drag it doesn't accept is left alone, so the browser shows that it can't
   * be dropped and no `drop` comes. The drop's default is always cancelled,
   * whatever the handler returns, so a handler that returns `undefined`
   * still stops a dropped file from opening in the page.
   *
   * The active drop target is the innermost one on the pointer's path that
   * accepts the drag. Unlike `mouseenter`, `onDragEnter` and `onDragLeave` go
   * to the active target only: moving between its children sends nothing,
   * and moving into a nested target leaves the outer one.
   *
   * The active target is worked out from the drag's events, not from
   * rendering. After an `onDragEnter`, one `onDragLeave` follows when a later
   * drag event finds the drag over another target or none, the drag leaves
   * the window, is dropped (after `onDrop`) or ends. A render that removes
   * the target's `onDrop` or changes what it accepts takes effect on the next
   * `dragenter` or `dragover`, or when the drag ends, not during the render,
   * and the leave then goes to the handler the element has at that point.
   * Nothing is sent once the element's `onDragLeave` is removed or its
   * component is gone.
   *
   * @since 0.1.0
   */
  onDrop(handler: View.Handler<Msg, DropPayload>, options: Omit<DropTargetOptions, "preventDefault">): this {
    const target: DropTargetOptions = { ...options, preventDefault: "always" }
    return this.on("drop" as any, handler as any, target)
  }
  /**
   * Sugar for `on("dragenter", handler)`. Sent when this drop target becomes
   * the active one, as `onDrop` describes; it does nothing on an element
   * without `onDrop`.
   *
   * @since 0.1.0
   */
  onDragEnter(handler: View.Handler<Msg, {}>): this {
    return this.on("dragenter" as any, handler as any)
  }
  /**
   * Sugar for `on("dragleave", handler)`. Sent when this drop target stops
   * being the active one, as `onDrop` describes.
   *
   * @since 0.1.0
   */
  onDragLeave(handler: View.Handler<Msg, {}>): this {
    return this.on("dragleave" as any, handler as any)
  }
  /**
   * Sugar for `on("dragover", handler)`, for an active drop target that
   * needs the pointer's position, such as a list reordered by halves of its
   * items. The host sends at most one per animation frame, only when the
   * position changed, and drops a queued one when the target stops being
   * active, goes away, stops accepting the drag after a render or the drag
   * ends. The browser's default is handled by
   * `onDrop`'s `accepts` either way.
   *
   * @since 0.1.0
   */
  onDragOver(handler: View.Handler<Msg, DragOverPayload>): this {
    return this.on("dragover" as any, handler as any)
  }
  /**
   * Sugar for `on("input", handler)`, on the elements that have it.
   *
   * @since 0.1.0
   */
  onInput<E2 extends E & { readonly input: unknown }>(
    this: VoidElement<Msg, R, E2, Node>,
    handler: View.Handler<Msg, E2["input"]>
  ): this {
    return this.on("input", handler) as any
  }
  /**
   * Sugar for `on("change", handler)`, on the elements that have it.
   *
   * @since 0.1.0
   */
  onChange<E2 extends E & { readonly change: unknown }>(
    this: VoidElement<Msg, R, E2, Node>,
    handler: View.Handler<Msg, E2["change"]>
  ): this {
    return this.on("change", handler) as any
  }
  /**
   * Sugar for `on("submit", handler)`, on a `form`. The browser host always
   * cancels the native submission of a form the app renders, so it takes no
   * options.
   *
   * @since 0.1.0
   */
  onSubmit<E2 extends E & { readonly submit: unknown }>(
    this: VoidElement<Msg, R, E2, Node>,
    handler: View.Handler<Msg, E2["submit"]>
  ): this {
    return this.on("submit", handler) as any
  }
  /**
   * Sugar for `on("toggle", handler)`: a `details`, a `dialog` or a popover
   * opened or closed.
   *
   * @since 0.1.0
   */
  onToggle<E2 extends E & { readonly toggle: unknown }>(
    this: VoidElement<Msg, R, E2, Node>,
    handler: View.Handler<Msg, E2["toggle"]>
  ): this {
    return this.on("toggle", handler) as any
  }
  /**
   * Sugar for `on("cancel", handler)`, on a `dialog`: a close request, such
   * as Escape. For a modal the browser host cancels it, and the Model
   * decides whether the dialog closes. `cancelable` is `false` when the
   * browser won't let the request be cancelled, as after repeated cancelled
   * requests: it closes the dialog itself, and `onClose` follows.
   *
   * @since 0.1.0
   */
  onCancel<E2 extends E & { readonly cancel: unknown }>(
    this: VoidElement<Msg, R, E2, Node>,
    handler: View.Handler<Msg, E2["cancel"]>
  ): this {
    return this.on("cancel", handler) as any
  }
  /**
   * Sugar for `on("close", handler)`, on a `dialog`: sent after every close,
   * the Model's included, except the close the browser host makes to switch
   * a dialog between modal and non-modal, and a close the browser reports
   * after the dialog was shown again.
   *
   * @since 0.1.0
   */
  onClose<E2 extends E & { readonly close: unknown }>(
    this: VoidElement<Msg, R, E2, Node>,
    handler: View.Handler<Msg, E2["close"]>
  ): this {
    return this.on("close", handler) as any
  }
}

/**
 * The builder of an HTML element that takes children: a `VoidElement` plus
 * `children`.
 *
 * **Details**
 *
 * On `h`, a tag's root builder is also callable as shorthand for
 * `children`, for an element with no attributes: `h.span(title)` is
 * `h.span.children(title)`. Either way the result is the builder, so more
 * children and attributes can follow, and a second `children` adds after
 * the first.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class Element<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  in out Node = unknown,
  out Tag extends string = string
> extends VoidElement<Msg, R, E, Node, Tag> {
  /**
   * Like `View.ElementBuilder.onMount`, keeping the HTML methods and
   * `children`.
   *
   * @since 0.1.0
   */
  override onMount<R2>(
    mount: Mount.Issued<Msg | Component.Noop, R2, Node, never>
  ): Element<Msg, R | R2, E, Node, Tag>
  /**
   * Rejects any other mount result, with a type error that says what to end
   * it with.
   *
   * @since 0.1.0
   */
  override onMount(mount: Mount.Issued<Msg | Component.Noop | View.MountHint, any, Node, never>): never
  override onMount(mount: View.Mount<Msg>): any {
    return (super.onMount as any)(mount)
  }
  /**
   * Adds children after the ones the builder holds, and returns the
   * builder: nodes, builders, text, arrays to flatten, and holes (`false`,
   * `null`, `undefined`). Their requirements join the element's.
   *
   * @since 0.1.0
   */
  children<const C extends ReadonlyArray<View.Input<Msg, any>>>(
    ...inputs: C
  ): Element<Msg, R | View.Requirements<C[number]>, E, Node, Tag> {
    return View.withContent(this, inputs) as any
  }
  /**
   * Like `View.ElementBuilder.forward`, keeping the HTML methods and
   * `children`.
   *
   * @since 0.1.0
   */
  override forward<R2 = never>(
    place: (
      node: Element<Msg, R, E, Node, Tag>
    ) => View.Element<Msg, R2> | View.ElementBuilder<Msg, R2, any, any>
  ): Element<Msg, R | R2, E, Node, Tag> {
    return View.withForward(this, place) as any
  }
}

/**
 * One class token for `classNames` and `Element.class`: a class string, or
 * `false`, `null` or `undefined` for a class that is left out.
 *
 * **Details**
 *
 * `true` and numbers aren't tokens, which catches `cond || "x"` and
 * `count && "x"` mistakes at compile time.
 *
 * @stability experimental
 * @category attributes
 * @since 0.1.0
 */
export type ClassToken = string | false | null | undefined

/**
 * An inline CSS value, or `false`, `null` or `undefined` to omit a declaration.
 *
 * @stability experimental
 * @category attributes
 * @since 0.1.0
 */
export type StyleValue = string | false | null | undefined

type StyleProperty = {
  [K in keyof CSSStyleDeclaration]: K extends string ? CSSStyleDeclaration[K] extends string ? K : never : never
}[keyof CSSStyleDeclaration]

/**
 * Inline styles with camelCase CSS property names and `--custom` properties.
 *
 * **Details**
 *
 * Property names come from the DOM library. Values are strings, not numbers;
 * include units where CSS requires them. Use `float` rather than `cssFloat`.
 * Empty strings and other falsy values omit the declaration.
 *
 * @stability experimental
 * @category attributes
 * @since 0.1.0
 */
export type Style =
  & { readonly [K in Exclude<StyleProperty, "cssText" | "cssFloat"> | "float"]?: StyleValue }
  & { readonly [K in `--${string}`]?: StyleValue }

/**
 * Joins class tokens with one space, skipping `false`, `null`, `undefined`
 * and `""`.
 *
 * **When to use**
 *
 * Use to build a class string outside `Element.class`, such as an attribute
 * other than `class` or a value passed to a child component.
 *
 * **Details**
 *
 * Tokens are kept as written: there is no splitting, deduplication or
 * conflict resolution between utility classes. With no tokens left it returns
 * `""`.
 *
 * **Example** (Building a class string)
 *
 * ```ts import.meta.vitest
 * import { Html } from "@effect/ui/html"
 *
 * const tabClass = (active: boolean) => Html.classNames("tab", active && "tab-active")
 *
 * tabClass(true) // => "tab tab-active"
 * tabClass(false) // => "tab"
 * ```
 *
 * @stability experimental
 * @category attributes
 * @since 0.1.0
 */
export const classNames = (...tokens: ReadonlyArray<ClassToken>): string => joinClassTokens(tokens)

const joinClassTokens = (tokens: ReadonlyArray<ClassToken>): string => {
  let out = ""
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token) out = out === "" ? token : out + " " + token
  }
  return out
}

/**
 * The tags that take children.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const containerTags = [
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "audio",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "colgroup",
  "data",
  "datalist",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "i",
  "iframe",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "main",
  "mark",
  "menu",
  "meter",
  "nav",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "search",
  "section",
  "select",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
  "video"
] as const

/**
 * The void tags, which take no children.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const voidTags = ["br", "col", "hr", "img", "input", "source", "track", "wbr"] as const

/**
 * A tag that takes children.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export type ContainerTag = typeof containerTags[number]

/**
 * A void tag.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export type VoidTag = typeof voidTags[number]

/**
 * The element names the vocabulary adds to `h`, bound to a component's
 * message type. Document-level tags (`html`, `head`, `body`, `title`, `meta`,
 * `link`, `base`, `script`, `style`) aren't here: the document head is managed
 * through a component's `head`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export type Tags<Msg> =
  & { readonly [K in ContainerTag]: View.Shorthand<Element<Msg, never, EventsOf<K>, HTMLElementTagNameMap[K], K>> }
  & { readonly [K in VoidTag]: VoidElement<Msg, never, EventsOf<K>, HTMLElementTagNameMap[K], K> }

/**
 * The type-level vocabulary, for `View.Register`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export interface Elements extends View.Elements {
  readonly Tags: Tags<this["Msg"]>
  readonly Host: Host
  readonly Head: HtmlHead.Entry
  readonly HeadValue: HtmlHead.HtmlHead
}

/**
 * Phantom: carries `Elements` on the module, so the module namespace is a
 * `View.Vocabulary<Elements>`. It's `undefined` at runtime.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const Elements: Elements | undefined = undefined

/**
 * The vocabulary's name, which a host lists to show it.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const name = "html"

/**
 * How the vocabulary folds its head: `HtmlHead.merge`, with the title read
 * from the folded `HtmlHead`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const head: View.HeadFold<HtmlHead.Entry, HtmlHead.HtmlHead> = {
  merge: HtmlHead.merge,
  title: (head) => head.title
}

const makeTags = (): Readonly<Record<string, VoidElement<any, any, any, any>>> => {
  const out: Record<string, VoidElement<any, any, any, any>> = {}
  for (const tag of containerTags) out[tag] = View.shorthand(new Element(tag))
  for (const tag of voidTags) out[tag] = new VoidElement(tag)
  return out
}

/**
 * The root element builders installed on `h`, one per tag, shared by every
 * render: a callable `View.shorthand` builder for a tag that takes
 * children, and a `VoidElement` for a void tag.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const tags: Readonly<Record<string, VoidElement<any, any, any, any>>> = makeTags()

// ---------------------------------------------------------------------------
// refs
// ---------------------------------------------------------------------------

/**
 * Declares a ref to an element of tag `tag`. Attaching it to another tag
 * doesn't compile. List rows use `Row.at(id)`.
 *
 * @stability experimental
 * @category refs
 * @since 0.1.0
 */
export const ref = <K extends keyof HTMLElementTagNameMap>(
  name: string,
  _tag: K
): Renderer.Ref<HTMLElementTagNameMap[K]> => Renderer.ref<HTMLElementTagNameMap[K]>(name)

/**
 * What `focus`, `blur` and `scrollIntoView` report: whether the ref was
 * rendered.
 *
 * @stability experimental
 * @category refs
 * @since 0.1.0
 */
export interface Found {
  readonly found: boolean
}

const withElement = <A>(
  ref: Renderer.Ref<any>,
  f: (host: Context.Service.Shape<typeof Host>, element: globalThis.Element) => A
): Effect.Effect<Option.Option<A>, never, Renderer.Refs | Host> =>
  Renderer.Refs.use((refs) =>
    Effect.flatMap(refs.lookup(ref), (node) =>
      Option.isNone(node)
        ? Effect.succeed(Option.none())
        : Host.useSync((host) => Option.some(f(host, node.value as globalThis.Element))))
  )

const FocusOptions = Schema.Struct({ preventScroll: Schema.optional(Schema.Boolean) })
const ScrollOptionsSchema = Schema.Struct({
  behavior: Schema.optional(Schema.Literals(["auto", "instant", "smooth"])),
  block: Schema.optional(Schema.Literals(["center", "end", "nearest", "start"])),
  inline: Schema.optional(Schema.Literals(["center", "end", "nearest", "start"]))
})

/**
 * The Command behind `focus`, for a story's `.resolve(Html.Focus, { found })`.
 *
 * @stability experimental
 * @category refs
 * @since 0.1.0
 */
export const Focus: Command.Factory<
  { readonly ref: Renderer.Ref<any>; readonly options?: { readonly preventScroll?: boolean | undefined } | undefined },
  Found
> = Command.make(
  "Html.focus",
  { args: { ref: Renderer.Ref, options: Schema.optional(FocusOptions) } },
  ({ options, ref }) =>
    Effect.map(
      withElement(ref, (host, element) => host.focus(element, options ?? {})),
      (done): Found => ({ found: Option.isSome(done) })
    )
)

/**
 * The Command behind `blur`.
 *
 * @stability experimental
 * @category refs
 * @since 0.1.0
 */
export const Blur: Command.Factory<{ readonly ref: Renderer.Ref<any> }, Found> = Command.make(
  "Html.blur",
  { args: { ref: Renderer.Ref } },
  ({ ref }) =>
    Effect.map(withElement(ref, (host, element) => host.blur(element)), (done): Found => ({
      found: Option.isSome(done)
    }))
)

/**
 * The Command behind `scrollIntoView`.
 *
 * @stability experimental
 * @category refs
 * @since 0.1.0
 */
export const ScrollIntoView: Command.Factory<
  { readonly ref: Renderer.Ref<any>; readonly options?: ScrollOptions | undefined },
  Found
> = Command.make(
  "Html.scrollIntoView",
  { args: { ref: Renderer.Ref, options: Schema.optional(ScrollOptionsSchema) } },
  ({ options, ref }) =>
    Effect.map(withElement(ref, (host, element) => host.scrollIntoView(element, options ?? {})), (done): Found => ({
      found: Option.isSome(done)
    }))
)

/**
 * The Command behind `measure`.
 *
 * @stability experimental
 * @category refs
 * @since 0.1.0
 */
export const Measure: Command.Factory<{ readonly ref: Renderer.Ref<any> }, Option.Option<Rect>> = Command.make(
  "Html.measure",
  { args: { ref: Renderer.Ref } },
  ({ ref }) => withElement(ref, (host, element) => host.measure(element))
)

/**
 * Focuses the element `ref` names, once the render the issuing `update`
 * caused is committed, and sends `f`'s message.
 *
 * **Details**
 *
 * A ref that isn't rendered gives `{ found: false }`. The ref resolves within
 * the issuing instance. `Refs` and `Html.Host` are framework services, so
 * this adds nothing to a component's requirements.
 *
 * **Example** (Focusing the new-todo field after adding)
 *
 * ```ts
 * import { Html } from "@effect/ui/html"
 * import { UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ SubmittedForm: {}, CompletedFocusNewTodo: {} })
 * const NewTodo = Html.ref("NewTodo", "input")
 *
 * const command = Html.focus(NewTodo, () => Message.CompletedFocusNewTodo())
 * ```
 *
 * @stability experimental
 * @category refs
 * @since 0.1.0
 */
export const focus = <N extends HTMLElement | SVGElement, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg,
  options?: { readonly preventScroll?: boolean | undefined }
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> =>
  Command.map(Focus(options === undefined ? { ref } : { ref, options }), f)

/**
 * Takes focus away from the element `ref` names, and sends `f`'s message.
 *
 * @stability experimental
 * @category refs
 * @since 0.1.0
 */
export const blur = <N extends HTMLElement | SVGElement, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> => Command.map(Blur({ ref }), f)

/**
 * Scrolls the element `ref` names into view, and sends `f`'s message.
 *
 * @stability experimental
 * @category refs
 * @since 0.1.0
 */
export const scrollIntoView = <N extends globalThis.Element, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg,
  options?: ScrollOptions
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> =>
  Command.map(ScrollIntoView(options === undefined ? { ref } : { ref, options }), f)

/**
 * Measures the element `ref` names, and sends `f`'s message with its box, or
 * `Option.none()` when the ref isn't rendered.
 *
 * @stability experimental
 * @category refs
 * @since 0.1.0
 */
export const measure = <N extends globalThis.Element, Msg>(
  ref: Renderer.Ref<N>,
  f: (rect: Option.Option<Rect>) => Msg
): Command.Mapped<Command.Issued<Option.Option<Rect>, never, Option.Option<Rect>, "Effect">, Msg> =>
  Command.map(Measure({ ref }), f)
