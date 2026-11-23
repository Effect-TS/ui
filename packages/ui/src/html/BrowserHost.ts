/**
 * The DOM host for `@effect/ui`: mounts a component tree into an element of a
 * real document.
 *
 * Events are delegated: the host keeps one listener per event name on the
 * document, and each element stores its handlers as data, so re-rendering
 * never touches listeners. An event goes to the innermost element with a
 * handler for it, and its handler gets a plain payload built from the DOM
 * event, never the event itself. A form the app renders never submits
 * natively, whether or not it has a `submit` handler.
 *
 * A `dialog` set with `modal(true)` is shown with `showModal()` at the commit
 * after it's in the document, and closed with `close()`. Dialogs shown in
 * the same commit open in document order, so one nested in another is on
 * top; one shown later is on top of those already open. The host cancels a
 * modal's `cancel` and sends it to `onCancel`, so the Model decides. When
 * the browser closes it anyway, as Chromium does after repeated cancelled
 * requests, the host shows it again on the next frame while the Model still
 * wants it, which moves focus to its first focusable element. Browsers
 * report each close a task later, so the host keeps one record per time it
 * showed the dialog, and each `close` event ends the oldest: it reaches
 * `onClose` only for the latest showing, and not for a close the host made
 * itself. Before removing a dialog it showed that is still open, or an
 * element containing one, the host closes it, the latest shown first, so
 * focus goes back to where it was before each one opened, as it does when
 * the Model closes them. That close isn't the app's either.
 *
 * A popover's `popoverOpen` is shown with `showPopover()` at the commit,
 * after the modal dialogs, since a modal opening closes the auto popovers
 * already showing, and hidden with `hidePopover()`. A `"manual"` popover is
 * applied at every commit, including when its component didn't render, since
 * a move in the document closes it without a `toggle`, and put back on the
 * frame after any other change;
 * an `"auto"` one is applied only when the Model's value or the mode
 * changes, and the browser's changes are left for the Model to follow.
 * Every `toggle` is sent, including a coalesced one whose states are equal,
 * since it may be the only report of a change.
 *
 * Showing a modal dialog or a popover doesn't scroll the page. A browser
 * focuses something inside a `<dialog>` as it shows it and scrolls to it,
 * so the host puts the page's scroll position back after a `showModal()`
 * or a `showPopover()` that moved focus, which also stops a smooth scroll
 * the focus started.
 *
 * A handler set with `{ preventDefault: true }` cancels its event's default
 * when it produces a message, before the message is sent, and leaves the
 * event alone when it returns `undefined`. Nothing else is cancelled, and the
 * host never stops an event's propagation: the delegated listeners run on the
 * document in the capture phase, so stopping it there would hide the event
 * from the target and from every other listener. A cancelled click on a
 * routed link isn't followed by `BrowserRouter`. `wheel`, `touchstart` and
 * `touchmove` aren't in the vocabulary, since browsers make document listeners
 * for them passive.
 *
 * The host does the drag and drop work a handler can't. On `dragstart` it puts
 * the innermost drag source's `draggable` data on the drag. While a drag is
 * over the app it works out the active drop target, the innermost element
 * whose `onDrop` accepts the drag's types, on every `dragenter` and
 * `dragover`, cancels those events there so the browser allows the drop, and
 * sends the target's enter and leave when it changes, never for its
 * children. A drag that leaves the window, or is cancelled, leaves the
 * target: a `dragleave` from the latest `dragenter`'s element with no enter
 * by the next task means the pointer left, whichever order the browser fires
 * them in. `onDragOver` is sent at most once per animation frame. A drop on a
 * target is always cancelled, and its strings and files are read then.
 *
 * `value`, `checked`, `selected` and `open` are controlled. The host sets them
 * after the element's children exist, skips a no-op so the caret doesn't jump,
 * and puts the Model's value back after the user changes it and the Model
 * didn't follow, whether `update` rejected the change or nothing handled it.
 * A focused `input` or `textarea` keeps its selection when the host writes
 * its `value`. A rejected edit, typed or composed, puts back the selection
 * from before it. A value `update` changed, such as uppercased text or
 * grouped digits, or one the Model set, keeps each end of the selection with
 * the unchanged text before it, else after it, and a caret at the end stays at
 * the end. When the text changed on both sides of the caret, as when a
 * character typed next to a separator moves it, the caret keeps its offset.
 * A field's `value` isn't written while an input method composes text in it,
 * from `compositionstart`, or an `input` that says it's composing, to
 * `compositionend`, so a patch or a rejected `input` can't replace the text
 * being composed; it's put back after `compositionend` instead.
 *
 * A server-rendered control the user changed before its instance adopted
 * keeps what it shows, and the host sends its state to the element's
 * `onInput` and `onChange` as if the events had just fired, then puts the
 * Model's value back as above if `update` didn't take it. A control counts as
 * changed when it differs from both the server's HTML and the Model's value,
 * so a field the browser filled in, by autofill or by restoring a form, is
 * reported too, and so is one showing what the browser made of a value it
 * can't show, such as a range input clamped to its `max`. A focused text
 * field gets no `change`, as the browser sends it when focus leaves.
 *
 * **Example** (Mounting an app)
 *
 * ```ts
 * import { BrowserHost, Html } from "@effect/ui/html"
 * import { Layer, Schema } from "effect"
 * import { Component, UiSchema } from "@effect/ui"
 *
 * const Message = UiSchema.TaggedEnum({ ClickedIncrement: {} })
 *
 * const Counter = Component.define({
 *   name: "Counter",
 *   scoped: false,
 *   model: Schema.Number,
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => 0,
 *   update: (count) => count + 1,
 *   view: (count, h) => h.button.onClick(Message.ClickedIncrement()).children(String(count))
 * })
 *
 * // The tree is mounted for as long as the Layer is built.
 * const main = Layer.launch(BrowserHost.mount(Counter, {}, document.getElementById("app")!))
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Scope from "effect/Scope"
import type * as Component from "../Component.ts"
import * as hostEvents from "../internal/hostEvents.ts"
import * as queryCore from "../internal/queryCore.ts"
import * as Renderer from "../Renderer.ts"
import * as View from "../View.ts"
import * as DomImages from "./DomImages.ts"
import * as DomSubscription from "./DomSubscription.ts"
import * as Html from "./Html.ts"
import * as elements from "./internal/elements.ts"
import * as headSync from "./internal/head.ts"
import * as markers from "./internal/markers.ts"
import { ownEvents } from "./internal/ownEvents.ts"
import * as server from "./internal/server.ts"
import * as submit from "./internal/submit.ts"

const SVG = "http://www.w3.org/2000/svg"

/** Events after which a controlled property may differ from what the Model says. */
const changeEvents: ReadonlyArray<string> = ["input", "change", "compositionend", "toggle", "close", "reset"]

const isDialog = (node: globalThis.Node): node is HTMLDialogElement =>
  node.nodeType === 1 && (node as globalThis.Element).localName === "dialog"

/** The drop target's events, which go to the active drop target and never bubble to a handler. */
const dropTargetEvents: ReadonlySet<string> = new Set(["dragenter", "dragleave", "dragover", "drop"])

/** The events a drag source needs whether or not it has handlers for them. */
const dragSourceEvents: ReadonlyArray<string> = ["dragstart", "dragend"]

/** Events the host listens to whether or not a handler wants them. */
const alwaysEvents: ReadonlyArray<string> = [...changeEvents, "submit", "compositionstart", "beforeinput"]

/** The Model's value of each controlled property, by node. One map for every host, so `htmlHost` reads it too. */
const wanted = new WeakMap<globalThis.Node, Map<string, unknown>>()

const controlled: ReadonlySet<string> = new Set(["value", "checked", "selected", "open", "popoverOpen"])

const emptyValue = (name: string): unknown => name === "value" ? "" : false

/** Input types whose `change` the browser fires when the field loses focus, not when the value changes. */
const changeOnBlur: ReadonlySet<string> = new Set(["text", "search", "url", "tel", "email", "password", "number"])

const isRadio = (node: globalThis.Node): node is HTMLInputElement =>
  (node as globalThis.Element).localName === "input" && (node as HTMLInputElement).type === "radio"

/**
 * The radio buttons `radio` unchecks when it's checked, itself included: those in its tree with its name
 * and its form owner, which may be a form they're outside of, named by their `form` attribute.
 */
const radioGroup = (radio: HTMLInputElement): ReadonlyArray<HTMLInputElement> => {
  if (radio.name === "") return [radio]
  const root = radio.getRootNode() as Document | DocumentFragment
  return Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="radio"]`)).filter((other) =>
    other.name === radio.name && other.form === radio.form
  )
}

/** Whether `option` is disabled, by its own attribute or by its `optgroup`'s. */
const optionDisabled = (option: HTMLOptionElement): boolean =>
  option.disabled || (option.parentElement?.localName === "optgroup" && option.parentElement.hasAttribute("disabled"))

/** The property the user changes on `node`, if it's a control. */
const userProp = (node: globalThis.Node): string | undefined => {
  switch ((node as globalThis.Element).localName) {
    case "input": {
      const type = (node as HTMLInputElement).type
      return type === "checkbox" || type === "radio" ? "checked" : "value"
    }
    case "textarea":
    case "select":
      return "value"
    case "option":
      return "selected"
    default:
      return undefined
  }
}

/**
 * Whether a `select`'s options differ from those its HTML selects: the ones with the `selected`
 * attribute, the last of them for a single select, or else the first option that isn't disabled, itself
 * or by its group, as a browser picks for a drop-down.
 */
const selectionChanged = (select: HTMLSelectElement): boolean => {
  const options = Array.from(select.options)
  const marked = options.map((option) => option.hasAttribute("selected"))
  if (select.multiple) return options.some((option, i) => option.selected !== marked[i])
  const last = marked.lastIndexOf(true)
  const index = last !== -1 ? last : select.size > 1 ? -1 : options.findIndex((option) => !optionDisabled(option))
  return options.some((option, i) => option.selected !== (i === index))
}

/** Whether `control` differs from the default the server's HTML gave it. */
const changedFromDefault = (control: globalThis.Element): boolean => {
  switch (control.localName) {
    case "input":
    case "textarea": {
      const field = control as HTMLInputElement
      return userProp(field) === "checked" ? field.checked !== field.defaultChecked : field.value !== field.defaultValue
    }
    case "select":
      return selectionChanged(control as HTMLSelectElement)
    default:
      return false
  }
}

/** The control an option's change is reported on and held for: its `select`, if it has one. */
const controlOf = (node: globalThis.Node): globalThis.Element => {
  const element = node as globalThis.Element
  return element.localName === "option" ? element.closest("select") ?? element : element
}

/** The node above `node` on an event's path: its parent, or a shadow root's host. */
const upFrom = (node: globalThis.Node): globalThis.Node | null =>
  node.parentNode ?? (node.nodeType === 11 ? (node as ShadowRoot).host ?? null : null)

/** `node` and the nodes above it, as an event at `node` would go. */
const pathFrom = (node: globalThis.Node): Array<globalThis.Node> => {
  const path: Array<globalThis.Node> = []
  for (let at: globalThis.Node | null = node; at !== null; at = upFrom(at)) path.push(at)
  return path
}

const isEmpty = (record: object): boolean => {
  // The record of a builder that set nothing, which needs no reading.
  if (record === View.noFields) return true
  for (const _ in record) return false
  return true
}

/** An HTML element's attributes under the names `setAttr` gives them, the later of two aliases winning. */
const canonicalAttrs = (attrs: Readonly<Record<string, string>>): Readonly<Record<string, string>> => {
  // No prototype, so `__PROTO__` folds to a name that is kept like any other.
  const out: Record<string, string> = Object.create(null)
  for (const name in attrs) {
    const normalized = elements.attributeName(name, false)
    if (normalized !== undefined) out[normalized] = attrs[name]!
  }
  return out
}

/**
 * What a pointer event's `pointerType` names, or `undefined` for an event
 * with none, such as a `mousedown` in a browser that sends it as a plain
 * `MouseEvent`, or a type no browser sends today.
 */
const pointerTypeOf = (event: Event): Html.PointerType | undefined => {
  const type = (event as { readonly pointerType?: unknown }).pointerType
  return type === "mouse" || type === "touch" || type === "pen" || type === "" ? type : undefined
}

/**
 * The `pointerType` of a click-like event's payload. A click with `detail`
 * 0, or a pointer event with an empty `pointerType`, came from no pointer:
 * the keyboard, or a script. Otherwise the last `pointerdown` says which
 * pointer it was, since a browser may report a tap's `click` as a mouse's,
 * as WebKit does. Without one, the event's own type, and `"mouse"` last.
 */
const pressedWith = (name: string, event: Event, last: Html.PointerType | undefined): Html.PointerType => {
  const own = pointerTypeOf(event)
  if (own === "" || (name === "click" && (event as MouseEvent).detail === 0)) return ""
  return last ?? own ?? "mouse"
}

const modifiers = (event: Event) => {
  const e = event as KeyboardEvent
  return { shift: e.shiftKey === true, ctrl: e.ctrlKey === true, alt: e.altKey === true, meta: e.metaKey === true }
}

const fieldsOf = (form: HTMLFormElement, submitter: HTMLElement | null) => {
  let data: FormData
  try {
    data = new FormData(form, submitter)
  } catch {
    data = new FormData(form)
  }
  // No prototype, so fields named `constructor` or `__proto__` are kept like any other.
  const fields: Record<string, string> = Object.create(null)
  const entries: Array<readonly [string, string]> = []
  data.forEach((value, name) => {
    if (typeof value !== "string") return
    entries.push([name, value])
    if (!Object.hasOwn(fields, name)) fields[name] = value
  })
  return { fields, entries }
}

/** The payload of `input` and `change` from `source`, the control that changed. */
const controlPayload = (source: globalThis.Element, event: Event | undefined): unknown => {
  const control = source as HTMLInputElement
  const e = event as Partial<InputEvent> | undefined
  const composing = e?.isComposing === true
  const inputType = typeof e?.inputType === "string" ? e.inputType : ""
  return control.localName === "input"
    ? { value: control.value, checked: control.checked === true, composing, inputType }
    : { value: String(control.value ?? ""), composing, inputType }
}

const noSelection = { selectionStart: null, selectionEnd: null }

const selectionOf = (target: EventTarget | null) => {
  const field = target as HTMLInputElement | null
  const tag = (field as globalThis.Element | null)?.localName
  if (tag !== "input" && tag !== "textarea") return noSelection
  try {
    const start = field!.selectionStart
    const end = field!.selectionEnd
    return typeof start === "number" && typeof end === "number"
      ? { selectionStart: start, selectionEnd: end }
      : noSelection
  } catch {
    // Older browsers throw, rather than return `null`, for an input type without a selection.
    return noSelection
  }
}

interface FieldState {
  readonly value: string
  readonly start: number
  readonly end: number
  readonly direction: "forward" | "backward" | "none"
}

const fieldStateOf = (target: EventTarget | null): FieldState | undefined => {
  const { selectionEnd, selectionStart } = selectionOf(target)
  if (selectionStart === null || selectionEnd === null) return undefined
  const field = target as HTMLInputElement
  return { value: field.value, start: selectionStart, end: selectionEnd, direction: field.selectionDirection ?? "none" }
}

const offsetIn = (current: string, next: string, offset: number): number => {
  const max = Math.min(current.length, next.length)
  let prefix = 0
  while (prefix < max && current.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix++
  if (offset <= prefix) return offset
  let suffix = 0
  while (
    suffix < max - prefix &&
    current.charCodeAt(current.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)
  ) suffix++
  const fromEnd = current.length - offset
  return fromEnd <= suffix ? next.length - fromEnd : Math.min(offset, next.length - suffix)
}

/** The clipboard's plain text. A browser may refuse the read, which counts as no text. */
const pastedText = (event: Event): string => {
  try {
    return (event as ClipboardEvent).clipboardData?.getData("text/plain") ?? ""
  } catch {
    return ""
  }
}

/**
 * Whether `target`, where focus came from or goes, is inside `element`.
 * `null`, another window or nowhere, is not. An event a script made can name
 * any event target, such as the window, and `contains` throws for one that
 * isn't a node. Only the browser can tell: a node from another realm, such as
 * an iframe's adopted into this document, fails `instanceof Node`, and an
 * object can fake `nodeType`.
 */
const containsTarget = (element: globalThis.Element, target: EventTarget | null): boolean => {
  try {
    return element.contains(target as globalThis.Node | null)
  } catch {
    return false
  }
}

const isDisabled = (target: EventTarget | null): boolean =>
  typeof (target as globalThis.Element | null)?.matches === "function" &&
  (target as globalThis.Element).matches(":disabled")

const isFocusVisible = (target: EventTarget | null): boolean => {
  if (typeof (target as globalThis.Element | null)?.matches !== "function") return true
  try {
    return (target as globalThis.Element).matches(":focus-visible")
  } catch {
    return true
  }
}

const fieldOf = (target: EventTarget | null, element: globalThis.Element) =>
  (target !== null && "value" in (target as object) ? target : element) as HTMLInputElement

/**
 * Builds the payload a handler gets: plain data, read from the event and the
 * elements involved.
 */
const payloadOf = (
  name: string,
  event: Event,
  target: EventTarget | null,
  element: globalThis.Element,
  pointer: Html.PointerType | undefined
): unknown => {
  switch (name) {
    case "click":
    case "dblclick":
    case "contextmenu":
    case "mousedown":
    case "mouseup":
    case "pointerdown":
    case "pointerup":
    case "pointercancel": {
      const e = event as MouseEvent
      return {
        button: e.button ?? 0,
        x: e.clientX ?? 0,
        y: e.clientY ?? 0,
        ...modifiers(event),
        pointerType: pressedWith(name, event, pointer)
      }
    }
    case "mouseenter":
    case "mouseleave": {
      const e = event as MouseEvent
      return { x: e.clientX ?? 0, y: e.clientY ?? 0 }
    }
    case "keydown":
    case "keyup": {
      const e = event as KeyboardEvent
      // Safari reports the key that ends a composition with `isComposing` false and `keyCode` 229.
      const composing = e.isComposing === true || (e as { readonly keyCode?: number }).keyCode === 229
      return { key: e.key ?? "", ...modifiers(event), composing, ...selectionOf(target) }
    }
    case "input":
    case "change":
      return controlPayload(fieldOf(target, element), event)
    case "compositionend":
      return { value: String(fieldOf(target, element).value ?? "") }
    case "paste":
      return { text: pastedText(event) }
    case "submit": {
      const form = (element.localName === "form" ? element : target) as HTMLFormElement
      return fieldsOf(form, (event as SubmitEvent).submitter ?? null)
    }
    case "toggle": {
      const e = event as Partial<ToggleEvent>
      // A popover's state is its own; a `details` or `dialog` reads `open`, with states derived where the
      // browser has no `ToggleEvent`.
      const open = element.hasAttribute("popover")
        ? e.newState === "open"
        : (element as HTMLDetailsElement).open === true
      const newState = e.newState === "open" || e.newState === "closed" ? e.newState : open ? "open" : "closed"
      const oldState = e.oldState === "open" || e.oldState === "closed"
        ? e.oldState
        : newState === "open"
        ? "closed"
        : "open"
      return { open, newState, oldState }
    }
    case "close":
      return { returnValue: (element as HTMLDialogElement).returnValue ?? "" }
    case "cancel":
      return { cancelable: event.cancelable }
    case "scroll":
      return { top: element.scrollTop, left: element.scrollLeft }
    case "focus":
      return { focusVisible: isFocusVisible(target) }
    case "blur":
      // A window listener's `blur` has no element that lost focus.
      return target === element ? { disabled: isDisabled(target) } : {}
    case "focusin":
      return { within: containsTarget(element, (event as FocusEvent).relatedTarget) }
    case "focusout":
      return {
        within: containsTarget(element, (event as FocusEvent).relatedTarget),
        disabled: isDisabled(target)
      }
    default:
      return {}
  }
}

/**
 * Makes a DOM host for `document`, plus `dispose`, which removes its
 * listeners.
 *
 * **Details**
 *
 * Most apps use `layer` or `mount`, which manage this for them. The host shows
 * the `html` vocabulary and host-neutral components. A component of another
 * vocabulary fails as a child when it mounts.
 *
 * The host keeps the document head in sync with the tree's folded
 * `HtmlHead`. It owns only tags marked `data-eui`, plus `<title>` and
 * `lang` / `dir` on `<html>`, and restores the shell's value once no entry
 * sets one. Static titles, `lang`, classes and `data-*` on `<html>` and
 * `<body>` belong in the root component's `head`, not in the shell: HTML
 * keeps the first copy of a duplicated attribute, so the shell's copy would
 * hide the framework's. `warn` reports a shell that conflicts with the head
 * on the first sync, and defaults to `console.warn`. The check runs in every
 * build, as `effect` has no development switch; it looks at the shell once,
 * and `warn: () => {}` silences it. Every host on one document shares one
 * baseline of the shell's values, captured by the first, so a second mount
 * doesn't take the first one's title for the shell's.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const makeHost = (
  document: Document,
  options?: { readonly warn?: ((message: string) => void) | undefined }
): Renderer.Host<globalThis.Node> & { readonly dispose: () => void } => {
  const syncHead = headSync.make(
    document,
    // oxlint-disable-next-line no-console
    options?.warn ?? ((message) => console.warn(message))
  )
  // An element's events are read from its mount's tree when an event fires.
  const stored = hostEvents.make<globalThis.Node>()
  const eventsAlong = stored.along
  /** The events of `node` itself. */
  const eventsOf = (node: globalThis.Node): Renderer.Events | undefined => eventsAlong(pathFrom(node))[0]
  const composing = new WeakSet<globalThis.Node>()
  const beforeEdits = new WeakMap<globalThis.Node, Map<string, FieldState>>()
  let pendingEdit:
    | { readonly node: globalThis.Node; readonly state: FieldState; readonly event: Partial<InputEvent> }
    | undefined
  const expectEdit = (node: globalThis.Node, event: Partial<InputEvent>) => {
    const state = fieldStateOf(node)
    const edit = pendingEdit = state === undefined ? undefined : { node, state, event }
    // An edit's `input` comes in the same task as its `beforeinput`, and a cancelled edit has none.
    if (edit !== undefined) {
      setTimeout(() => {
        if (pendingEdit === edit) pendingEdit = undefined
      }, 0)
    }
  }
  const recordEdit = (node: globalThis.Node, state: FieldState | undefined) => {
    if (state === undefined) return
    let edits = beforeEdits.get(node)
    if (edits === undefined) beforeEdits.set(node, edits = new Map())
    edits.set(state.value, state)
  }
  const settleEdit = (node: globalThis.Node, event: Partial<InputEvent>) => {
    const edit = pendingEdit
    pendingEdit = undefined
    if (edit?.node === node && edit.event.defaultPrevented !== true && edit.event.inputType === event.inputType) {
      recordEdit(node, edit.state)
    }
  }
  const retireEdits = (node: globalThis.Node) => {
    if (!composing.has(node)) beforeEdits.delete(node)
  }
  const writeControlled = (element: any, name: string, value: unknown) => {
    const state = name === "value" && element.getRootNode().activeElement === element
      ? fieldStateOf(element)
      : undefined
    if (state === undefined) {
      element[name] = value
      return
    }
    const { scrollLeft, scrollTop } = element
    element.value = value
    const shown: string = element.value
    const before = beforeEdits.get(element)?.get(shown)
    if (before !== undefined) element.setSelectionRange(before.start, before.end, before.direction)
    else if (state.start !== state.end || state.end !== state.value.length) {
      const start = offsetIn(state.value, shown, state.start)
      const end = state.end === state.start ? start : offsetIn(state.value, shown, state.end)
      element.setSelectionRange(start, end, state.direction)
    } else return
    element.scrollLeft = scrollLeft
    element.scrollTop = scrollTop
  }
  const listening = new Map<string, (event: Event) => void>()
  // The pointer of the last `pointerdown`, which the click-like events that follow it report.
  let lastPointer: Html.PointerType | undefined
  const onPointerDown = (event: Event) => {
    lastPointer = pointerTypeOf(event) || undefined
  }
  document.addEventListener("pointerdown", onPointerDown, { capture: true })
  const view = document.defaultView
  const later: (f: () => void) => void = view !== null && typeof view.requestAnimationFrame === "function"
    ? (f) => {
      view.requestAnimationFrame(f)
    }
    : (f) => {
      setTimeout(f, 0)
    }

  // A browser focuses inside a dialog as it shows it and scrolls there. Scrolling back to where the page
  // was, even when it hasn't moved yet, also cancels a smooth scroll the focus started.
  const keepingScroll = (show: () => void) => {
    const view = document.defaultView
    if (view === null || typeof view.scrollTo !== "function") return show()
    const focused = document.activeElement
    const left = view.scrollX
    const top = view.scrollY
    show()
    if (document.activeElement !== focused) view.scrollTo({ left, top, behavior: "instant" })
  }

  // -- dialogs -----------------------------------------------------------------
  // A dialog's `open` is `false`, `true` or `"modal"`. `showModal()` needs a connected dialog, so a modal
  // is shown at the commit. Closing always goes through `close()`: setting `open` to false on a modal
  // dialog leaves the page inert in browsers.
  /** Dialogs the host showed with `showModal()` and hasn't seen close since. */
  const modals = new WeakSet<globalThis.Element>()
  /**
   * Each time a dialog was shown, oldest first, until its `close` event arrives. Browsers report every
   * close in a later task, so several can be queued: each event ends the oldest showing, and only the
   * close of the latest showing, not made by the host to change mode or before a removal, is the app's.
   */
  const showings = new WeakMap<globalThis.Element, Array<{ byHost: boolean; closed: boolean }>>()
  const showingsOf = (dialog: globalThis.Element) => {
    let list = showings.get(dialog)
    if (list === undefined) {
      list = []
      showings.set(dialog, list)
    }
    return list
  }
  /** Dialogs whose Model says `"modal"`, checked at every commit. */
  const modalWanted = new Set<HTMLDialogElement>()
  /**
   * Dialogs with a showing the host recorded, in the order they were shown, closed before a removal takes
   * them out. Pruned at commit.
   */
  const shown = new Set<HTMLDialogElement>()
  /**
   * Whether `:modal` works here, found on the first `showModal()`. Where it does, a dialog the host
   * showed but the browser no longer has as modal, such as one moved in the document, is shown again.
   * Some emulated documents claim the selector and never match it, so it's tested, not asked.
   */
  let modalPseudo: boolean | undefined
  const matchesModal = (dialog: HTMLDialogElement): boolean => {
    try {
      return dialog.matches(":modal")
    } catch {
      return false
    }
  }

  const shownAs = (dialog: HTMLDialogElement): boolean | "modal" =>
    !dialog.open
      ? false
      : modals.has(dialog) && (modalPseudo !== true || matchesModal(dialog))
      ? "modal"
      : true

  /**
   * Records the showing of an open dialog that has none, such as a server-rendered `open` adopted by
   * hydration, so the close that ends it, the host's or the browser's, is attributed to it. A dialog
   * whose latest record is still open already has one, so repeated reconciliation adds nothing.
   */
  const adoptShowing = (dialog: HTMLDialogElement) => {
    if (!dialog.open) return
    const list = showingsOf(dialog)
    const latest = list.at(-1)
    if (latest === undefined || latest.closed) list.push({ byHost: false, closed: false })
    shown.add(dialog)
  }

  const closeDialog = (dialog: HTMLDialogElement, byHost: boolean) => {
    if (!dialog.open) return
    modals.delete(dialog)
    adoptShowing(dialog)
    shown.delete(dialog)
    const current = showingsOf(dialog).at(-1)!
    current.closed = true
    current.byHost = byHost
    dialog.close()
  }

  /**
   * Closes the open dialogs the host showed that are `node` or inside it, before it's removed. Once it's
   * out of the document, `close()` would leave focus on the body. The latest shown closes first, so each
   * one hands focus back to where it was when it opened, which may be in a dialog shown before it.
   */
  const closeShownIn = (node: globalThis.Node) => {
    for (const dialog of Array.from(shown).reverse()) {
      if (node.contains(dialog)) closeDialog(dialog, true)
    }
  }

  /** Shows `dialog` as `want` says, from what it shows now. The caller checks `modal` needs it connected. */
  const showDialog = (dialog: HTMLDialogElement, want: boolean | "modal") => {
    adoptShowing(dialog)
    const current = shownAs(dialog)
    if (current === want) return
    if (want === false) return closeDialog(dialog, false)
    // Between non-modal and modal the browser needs a close first. That close isn't the app's.
    if (current !== false) closeDialog(dialog, true)
    if (want === "modal") {
      keepingScroll(() => dialog.showModal())
      modals.add(dialog)
      modalPseudo ??= matchesModal(dialog)
    } else {
      dialog.show()
    }
    showingsOf(dialog).push({ byHost: false, closed: false })
    shown.add(dialog)
  }

  // -- popovers ----------------------------------------------------------------
  // A popover's `popoverOpen` is separate from `open`. A manual popover is applied at every commit and put
  // back after any other change; an auto popover is applied only when the Model's value or the mode
  // changes, and the browser's changes are left for the Model to follow. `showPopover()` needs a connected
  // element with the attribute, so a popover is shown at the commit, after the modal dialogs: a modal
  // opening closes the auto popovers already showing.
  /** Popovers whose Model says open, shown at the next commit. */
  const popoversToShow = new Set<HTMLElement>()
  /**
   * Manual popovers, reconciled at every commit whether or not they rendered: moving an element, as a
   * keyed reorder of an ancestor does, closes its popover without a `toggle`. One that has left the
   * document is dropped.
   */
  const manualPopovers = new Set<HTMLElement>()
  /** The mode each popover's state was last applied under. */
  const popoverModes = new WeakMap<globalThis.Node, string | null>()

  const popoverShowing = (element: HTMLElement): boolean => {
    try {
      return element.matches(":popover-open")
    } catch {
      return false
    }
  }

  /** Applies the Model's state: hiding at once, showing at the commit, or at once when `now` and it can. */
  const applyPopover = (element: HTMLElement, want: boolean, now = false) => {
    if (want) {
      if (!now) popoversToShow.add(element)
      else if (element.isConnected && element.hasAttribute("popover") && !popoverShowing(element)) {
        keepingScroll(() => element.showPopover())
      }
      return
    }
    popoversToShow.delete(element)
    if (popoverShowing(element)) element.hidePopover()
  }

  /**
   * Shows the popovers queued for this commit and the manual popovers that should be showing, if they're
   * still connected and wanted, in document order, and hides the manual ones that shouldn't be.
   */
  const showPopovers = () => {
    for (const element of manualPopovers) {
      if (!element.isConnected) manualPopovers.delete(element)
      else if (wanted.get(element)?.get("popoverOpen") === true) popoversToShow.add(element)
      else if (popoverShowing(element)) element.hidePopover()
    }
    if (popoversToShow.size === 0) return
    const popovers = [...popoversToShow]
    popoversToShow.clear()
    popovers.sort((a, b) => (a.compareDocumentPosition(b) & 4) !== 0 ? -1 : 1)
    for (const element of popovers) {
      // One that left the document is forgotten; a render that brings it back queues it again.
      if (!element.isConnected || !element.hasAttribute("popover")) continue
      if (wanted.get(element)?.get("popoverOpen") !== true || popoverShowing(element)) continue
      keepingScroll(() => element.showPopover())
    }
  }

  const restoreNode = (node: globalThis.Node) => {
    const values = wanted.get(node)
    if (values === undefined) return
    const element = node as any
    for (const [name, value] of values) {
      if (name === "value" && composing.has(node)) continue
      if (name === "open" && isDialog(node)) {
        // A dialog that left the document can't be shown; a later commit shows it if it comes back.
        if (node.isConnected) showDialog(node, value as boolean | "modal")
      } else if (name === "popoverOpen") {
        // Only a manual popover is put back. An auto popover's changes are the browser's, for the Model
        // to follow.
        if ((node as globalThis.Element).getAttribute("popover") === "manual") {
          applyPopover(node as HTMLElement, value === true, true)
        }
      } else if (element[name] !== value) writeControlled(element, name, value)
    }
  }
  /** Restores `node` and what changing it also changes. */
  const restoreAffected = (node: globalThis.Node): void => {
    restoreNode(node)
    const element = node as HTMLInputElement
    switch (element.localName) {
      case "input": {
        // A radio button unchecks the others in its group.
        if (isRadio(element)) { for (const other of radioGroup(element)) restoreNode(other) }
        return
      }
      case "select": {
        for (const option of (node as HTMLSelectElement).options) restoreNode(option)
        return
      }
      case "form": {
        // A reset puts every control back to its default without firing input or change.
        for (const control of (node as HTMLFormElement).elements) restoreAffected(control)
        return
      }
    }
  }
  let restoring: Set<globalThis.Node> | undefined
  /**
   * Puts controlled properties back once the event and the flush it caused
   * are over. A flush that accepted the change already moved the wanted value,
   * so this is then a no-op.
   */
  const restoreSoon = (target: EventTarget | null) => {
    if (target === null || !("nodeType" in target)) return
    if (restoring === undefined) {
      restoring = new Set()
      later(() => {
        const nodes = restoring!
        restoring = undefined
        for (const node of nodes) {
          restoreAffected(node)
          retireEdits(node)
        }
      })
    }
    restoring.add(target as globalThis.Node)
  }

  // -- edits before adoption -------------------------------------------------
  // A server-rendered control the user changed before its instance adopted keeps what it shows, and the
  // change is reported to its `onInput` and `onChange` at the commit, as if the events had just fired.
  // A change is told from an untouched control by its live state differing from the server's default.
  /** Controls changed before they adopted, whose Model value isn't written until the commit reports them. */
  const edited = new Set<globalThis.Element>()
  /**
   * Whether each control adoption has touched since the last commit was changed, read before adoption
   * wrote to it. Adoption's own writes change controls: checking one radio button unchecks the user's, and
   * selecting an option unselects the others, so a control read after one of them would look changed, or
   * untouched, depending on which was adopted first. A radio group is read as one. A textarea is read
   * when hydration inspects it, just before adopting it: adoption rebuilds its text, which moves the
   * default, and an untouched textarea's value with it.
   */
  const changedBefore = new Map<globalThis.Node, boolean>()

  /** Whether `control` was changed when adoption first touched it, or any button of its radio group. */
  const wasChanged = (control: globalThis.Element): boolean => {
    let changed = changedBefore.get(control)
    if (changed === undefined) {
      const group = isRadio(control) ? radioGroup(control) : [control]
      changed = group.some(changedFromDefault)
      for (const member of group) changedBefore.set(member, changed)
    }
    return changed
  }

  /** Sends `name` for `control` to the innermost handler for it, from `control` up, as the event would go. */
  const report = (control: globalThis.Element, name: string) => {
    for (const entry of eventsAlong(pathFrom(control))) {
      const handler = entry?.handlers[name]
      if (entry !== undefined && handler !== undefined) {
        return entry.dispatch(name, handler, controlPayload(control, undefined))
      }
    }
  }

  /**
   * Reports each held control's state as its `input` and `change`. A radio group is reported by the
   * checked button. A focused text field gets no `change`: the browser fires it when focus leaves.
   */
  const reportEdits = () => {
    const controls = Array.from(edited)
    edited.clear()
    for (const node of controls) {
      const control = node as HTMLInputElement
      if (!control.isConnected || (isRadio(control) && !control.checked)) continue
      report(control, "input")
      const typing = control.localName === "textarea" ||
        (control.localName === "input" && changeOnBlur.has(control.type))
      if (!typing || control.ownerDocument.activeElement !== control) report(control, "change")
      // A radio button restores its whole group.
      restoreSoon(control)
    }
  }

  // -- drag and drop ---------------------------------------------------------
  // The active drop target is the innermost element on the pointer's path whose `drop` options accept
  // the drag's types. It's worked out again on every `dragenter` and `dragover`, so its enter and leave
  // come from comparing targets, never from the browser's enter and leave on the target's children.
  let active: globalThis.Element | undefined
  /** The target of the latest `dragenter` anywhere in the document. */
  let entered: EventTarget | null = null
  let exitCheck: ReturnType<typeof setTimeout> | undefined
  /** Whether one of the app's drop targets took a drop since the last `dragstart`. */
  let droppedHere = false
  let overFrame: number | undefined
  let overQueued: Html.DragOverPayload | undefined
  let overSent: Html.DragOverPayload | undefined

  const frame = (f: () => void): number =>
    view !== null && typeof view.requestAnimationFrame === "function"
      ? view.requestAnimationFrame(f)
      : setTimeout(f, 0) as unknown as number
  const cancelFrame = (id: number) => {
    if (view !== null && typeof view.cancelAnimationFrame === "function") view.cancelAnimationFrame(id)
    else clearTimeout(id)
  }

  const typesOf = (event: Event): ReadonlyArray<string> =>
    Array.from((event as DragEvent).dataTransfer?.types ?? [], (type) => type.toLowerCase())

  /** Whether an element with the events `entry` is a drop target that accepts a drag of `types`. */
  const accepts = (entry: Renderer.Events | undefined, types: ReadonlyArray<string>): boolean => {
    if (entry === undefined || entry.handlers.drop === undefined) return false
    const accepted = (entry.options.drop as Html.DropTargetOptions | undefined)?.accepts
    return accepted?.some((type) => types.includes(type.toLowerCase())) === true
  }

  /** The innermost element on the event's path that accepts its drag, with its events. */
  const dropTargetOf = (
    event: Event
  ): { readonly element: globalThis.Element; readonly events: Renderer.Events } | undefined => {
    const types = typesOf(event)
    if (types.length === 0) return undefined
    const path = event.composedPath() as Array<globalThis.Node>
    const entries = eventsAlong(path)
    for (let i = 0; i < path.length; i++) {
      if (accepts(entries[i], types)) return { element: path[i] as globalThis.Element, events: entries[i]! }
    }
    return undefined
  }

  const boxOf = (event: Event, element: globalThis.Element): Html.DragOverPayload => {
    const rect = element.getBoundingClientRect()
    const e = event as MouseEvent
    return { x: (e.clientX ?? 0) - rect.left, y: (e.clientY ?? 0) - rect.top, width: rect.width, height: rect.height }
  }

  /** Sends `name` to `element`'s own handler, if it has one. */
  const sendTo = (element: globalThis.Element, name: string, payload: unknown) => {
    const entry = eventsOf(element)
    const handler = entry?.handlers[name]
    if (entry !== undefined && handler !== undefined) entry.dispatch(name, handler, payload)
  }

  const cancelOver = () => {
    if (overFrame !== undefined) cancelFrame(overFrame)
    overFrame = undefined
    overQueued = undefined
  }

  /** Makes `next` the active drop target: the previous one leaves, then `next` enters. */
  const activate = (next: globalThis.Element | undefined) => {
    if (next === active) return
    const previous = active
    active = next
    // A queued position belongs to the previous target.
    cancelOver()
    overSent = undefined
    if (previous !== undefined) sendTo(previous, "dragleave", {})
    if (next !== undefined) sendTo(next, "dragenter", {})
  }

  const cancelExitCheck = () => {
    if (exitCheck !== undefined) clearTimeout(exitCheck)
    exitCheck = undefined
  }

  /** Ends the drag for the drop targets: the active one leaves, and nothing stays queued. */
  const endTargets = () => {
    cancelExitCheck()
    entered = null
    activate(undefined)
  }

  /** Queues the active target's `dragover` for the next frame, unless its position is what it last got. */
  const queueOver = (element: globalThis.Element, payload: Html.DragOverPayload, types: ReadonlyArray<string>) => {
    if (eventsOf(element)?.handlers.dragover === undefined) return
    overQueued = payload
    if (overFrame !== undefined) return
    overFrame = frame(() => {
      overFrame = undefined
      const next = overQueued
      overQueued = undefined
      // A render since the event may have taken the element's `onDrop` away or changed what it accepts.
      if (next === undefined || active !== element || !element.isConnected || !accepts(eventsOf(element), types)) return
      if (
        overSent !== undefined && overSent.x === next.x && overSent.y === next.y && overSent.width === next.width &&
        overSent.height === next.height
      ) return
      overSent = next
      sendTo(element, "dragover", next)
    })
  }

  const onDropTarget = (name: string, event: DragEvent) => {
    switch (name) {
      case "dragenter":
      case "dragover": {
        // Any enter or over means the pointer is still in the document.
        cancelExitCheck()
        if (name === "dragenter") entered = event.target
        const found = dropTargetOf(event)
        const target = found?.element
        if (found !== undefined) {
          event.preventDefault()
          const dropEffect = (found.events.options.drop as Html.DropTargetOptions).dropEffect
          if (dropEffect !== undefined && event.dataTransfer !== null) event.dataTransfer.dropEffect = dropEffect
        }
        activate(target)
        if (name === "dragover" && target !== undefined) queueOver(target, boxOf(event, target), typesOf(event))
        return
      }
      case "dragleave": {
        // A browser fires the leave of the element the pointer left and the enter of the one it reached
        // in the same task, in either order. A leave from the latest enter's target with no enter after it
        // by the next task means the pointer left the document, or the drag was cancelled.
        if (event.target !== entered) return
        cancelExitCheck()
        exitCheck = setTimeout(() => {
          exitCheck = undefined
          endTargets()
        }, 0)
        return
      }
      case "drop": {
        const target = dropTargetOf(event)?.element
        if (target === undefined) {
          endTargets()
          return
        }
        event.preventDefault()
        droppedHere = true
        const transfer = event.dataTransfer
        // No prototype, so a type named `constructor` is kept like any other.
        const data: Record<string, string> = Object.create(null)
        for (const type of transfer?.types ?? []) {
          if (type !== "Files") data[type] = transfer!.getData(type)
        }
        const files = Array.from(transfer?.files ?? [])
        const payload: Html.DropPayload = { data, files, ...boxOf(event, target) }
        sendTo(target, "drop", payload)
        endTargets()
        return
      }
    }
  }

  /** Puts the innermost drag source's data on the drag: `entries` are the events along its path. */
  const startDrag = (event: DragEvent, entries: ReadonlyArray<Renderer.Events | undefined>) => {
    droppedHere = false
    const transfer = event.dataTransfer
    if (transfer === null) return
    for (const entry of entries) {
      const source = entry?.options.dragstart as Html.DragSourceOptions | undefined
      if (source?.data === undefined) continue
      for (const type in source.data) transfer.setData(type, source.data[type]!)
      if (source.effectAllowed !== undefined) transfer.effectAllowed = source.effectAllowed
      return
    }
  }

  const listener = (name: string) => (event: Event) => {
    if (dropTargetEvents.has(name)) return onDropTarget(name, event as DragEvent)
    if ((name === "cancel" || name === "close") && event.target !== null && isDialog(event.target as globalThis.Node)) {
      const dialog = event.target as HTMLDialogElement
      if (name === "cancel") {
        // A modal's close request is the Model's to answer, through `onCancel`. A browser can make the
        // event uncancelable; the close that follows is then put back by the reconciliation below.
        if (wanted.get(dialog)?.get("open") === "modal") event.preventDefault()
      } else {
        // `close` comes a task after the close, and ends the oldest showing. The host's own close isn't
        // the app's, and neither is the close of a showing the dialog has been shown again since.
        const list = showings.get(dialog)
        const ended = list?.shift()
        if (ended !== undefined && (ended.byHost || list!.length > 0)) return
        if (!dialog.open) modals.delete(dialog)
      }
    }
    const path = event.composedPath() as Array<globalThis.Node>
    const target = path[0] ?? event.target
    if (name === "compositionstart" || name === "compositionend" || name === "input" || name === "beforeinput") {
      if (target !== null && target !== undefined && "nodeType" in target) {
        const node = target as globalThis.Node
        const e = event as Partial<InputEvent>
        if (name === "beforeinput") {
          if (e.isComposing !== true && !composing.has(node)) expectEdit(node, e)
        } else {
          if (name === "compositionstart") recordEdit(node, fieldStateOf(node))
          else if (name === "input") settleEdit(node, e)
          if (name === "compositionstart" || e.isComposing === true) composing.add(node)
          else composing.delete(node)
        }
      }
    }
    const entries = eventsAlong(path)
    if (name === "dragstart") startDrag(event as DragEvent, entries)
    // The app owns its forms' submissions, handled or not. Other forms in the document are left alone.
    // An unhandled one is marked, so the browser Router can still route a GET form.
    if (
      name === "submit" && event.target !== null && entries[path.indexOf(event.target as globalThis.Node)] !== undefined
    ) {
      event.preventDefault()
      submit.ownedUnhandled.add(event)
    }
    const own = ownEvents.has(name)
    for (let i = 0; i < path.length; i++) {
      const node = path[i]!
      const entry = entries[i]
      const handler = entry?.handlers[name]
      if (entry !== undefined && handler !== undefined) {
        if (name === "submit") {
          event.preventDefault()
          submit.ownedUnhandled.delete(event)
        }
        const preventDefault = entry.options[name]?.preventDefault
        if (preventDefault === "always") event.preventDefault()
        entry.dispatch(
          name,
          handler,
          name === "dragend"
            ? dragEndPayload(event as DragEvent)
            : payloadOf(name, event, target, node as globalThis.Element, lastPointer),
          preventDefault === true ? () => event.preventDefault() : undefined
        )
        break
      }
      if (own) break
    }
    if (changeEvents.includes(name)) restoreSoon(target)
    if (name === "dragend") endTargets()
  }

  const dragEndPayload = (event: DragEvent): Html.DragEndPayload => ({
    // The app saw its own drops. Elsewhere, browsers report a drop with the effect it had, though not
    // every browser does so reliably.
    dropped: droppedHere || (event.dataTransfer !== null && event.dataTransfer.dropEffect !== "none")
  })

  const listen = (name: string) => {
    if (listening.has(name)) return
    const f = listener(name)
    listening.set(name, f)
    document.addEventListener(name, f, { capture: true })
  }
  for (const name of alwaysEvents) listen(name)
  /** Listens for what an element's handlers and options need. */
  const listenFor = (handlers: Renderer.Events["handlers"], options: Renderer.Events["options"]) => {
    for (const name in handlers) listen(name)
    // A drag source needs its `dragstart` without a handler, and a drop target all of its events.
    if (options.dragstart !== undefined) { for (const name of dragSourceEvents) listen(name) }
    // `dragend` ends an in-app drag for the targets too. Whoever reads `dropped` needs `dragstart`, which
    // resets it, even for a native drag source such as a link with only `onDragEnd`.
    if (handlers.drop !== undefined) { for (const name of [...dropTargetEvents, ...dragSourceEvents]) listen(name) }
    if (handlers.dragend !== undefined) { for (const name of dragSourceEvents) listen(name) }
  }

  /**
   * Sets a property of an adopted element. A control the user changed from the server's default, to
   * other than the Model's value, is held: it keeps what it shows, and the commit reports it. In a changed
   * radio group that holds the user's button, and the one the Model checks, which would uncheck it.
   */
  const adoptProp = (node: globalThis.Node, name: string, value: unknown): void => {
    if (name === userProp(node)) {
      const control = controlOf(node)
      if (wasChanged(control) && (node as any)[name] !== (value === undefined ? emptyValue(name) : value)) {
        edited.add(control)
      }
    }
    host.setProp(node, name, value)
  }

  const scratch = document.createElement("div").style

  const outsideStyle = (element: globalThis.Element, previous: string | undefined): Array<string> | undefined => {
    if ((element.getAttribute("style") ?? undefined) === previous) return undefined
    const style = (element as HTMLElement).style
    if (style === undefined) return undefined
    scratch.cssText = previous ?? ""
    const kept: Array<string> = []
    for (let i = 0, length = style.length; i < length; i++) {
      const name = style[i]!
      const value = style.getPropertyValue(name)
      if (value === "") continue
      const priority = style.getPropertyPriority(name)
      if (value !== scratch.getPropertyValue(name) || priority !== scratch.getPropertyPriority(name)) {
        kept.push(name, value, priority)
      }
    }
    return kept
  }

  const host: Renderer.Host<globalThis.Node> & { readonly dispose: () => void } = {
    createElement: (tag) =>
      elements.svgTags.has(tag) ? document.createElementNS(SVG, tag) : document.createElement(tag),
    createText: (text) => document.createTextNode(text),
    createContainer: () => document.createDocumentFragment(),
    setText(node, text) {
      const t = node as globalThis.Text
      if (t.data !== text) t.data = text
    },
    normalizeAttrs(node, attrs) {
      // Nearly every record is canonical already, and is diffed as it is.
      for (const name in attrs) {
        if (elements.attributeName(name, false) !== name) {
          // SVG names are case-sensitive, so they have no aliases; `setAttr` drops the unsafe ones.
          return (node as globalThis.Element).namespaceURI === SVG ? attrs : canonicalAttrs(attrs)
        }
      }
      return attrs
    },
    setAttr(node, name, value, previous) {
      const element = node as globalThis.Element
      const normalized = elements.attributeName(name, element.namespaceURI === SVG)
      if (normalized === undefined) return
      name = normalized
      const kept = name === "style" ? outsideStyle(element, previous) : undefined
      if (value === undefined) element.removeAttribute(name)
      else element.setAttribute(name, value)
      if (kept !== undefined) {
        const style = (element as HTMLElement).style
        for (let i = 0; i < kept.length; i += 3) style.setProperty(kept[i]!, kept[i + 1]!, kept[i + 2])
      }
    },
    setProp(node, name, value) {
      const element = node as any
      if (name === "popoverOpen") {
        const want = value === true
        let values = wanted.get(node)
        if (values === undefined) {
          values = new Map()
          wanted.set(node, values)
        }
        const previous = values.get(name)
        values.set(name, want)
        const mode = (node as globalThis.Element).getAttribute("popover")
        const modeChanged = popoverModes.get(node) !== mode
        popoverModes.set(node, mode)
        if (mode === "manual") manualPopovers.add(node as HTMLElement)
        else manualPopovers.delete(node as HTMLElement)
        // Edge-triggered: an auto popover the browser closed stays closed until the Model's value changes.
        if (mode === "auto" && !modeChanged && previous === want) return
        applyPopover(node as HTMLElement, want)
        return
      }
      if (name === "open" && isDialog(node)) {
        const want = value === "modal" ? "modal" : value === true
        let values = wanted.get(node)
        if (values === undefined) {
          values = new Map()
          wanted.set(node, values)
        }
        values.set(name, want)
        if (want === "modal") {
          // Shown at the commit, once it's connected, outer dialogs first.
          modalWanted.add(node)
          listen("cancel")
          return
        }
        modalWanted.delete(node)
        showDialog(node, want)
        return
      }
      if (controlled.has(name)) {
        let values = wanted.get(node)
        if (value === undefined) {
          values?.delete(name)
          value = emptyValue(name)
        } else {
          if (values === undefined) {
            values = new Map()
            wanted.set(node, values)
          }
          values.set(name, value)
        }
        // A control changed before it adopted shows the change until the commit reports it.
        if (edited.size > 0 && edited.has(controlOf(node)) && name === userProp(node)) return
        if (name === "value" && composing.has(node)) return
        // Skip a no-op, so a caret in the middle of the text stays where it is.
        if (element[name] !== value) writeControlled(element, name, value)
        if (name === "value") retireEdits(node)
        return
      }
      if (value === undefined) {
        const current = element[name]
        element[name] = typeof current === "string" ? "" : typeof current === "boolean" ? false : null
      } else {
        element[name] = value
      }
    },
    insertBefore: (parent, node, ref) => {
      parent.insertBefore(node, ref ?? null)
    },
    remove: (node) => {
      if (shown.size > 0) closeShownIn(node)
      node.parentNode?.removeChild(node)
    },
    removeChildren: (parent, nodes) => {
      if (shown.size > 0) { for (const node of nodes) closeShownIn(node) }
      // A parent that holds these nodes and nothing else, as a list's element usually does, is cleared
      // in one step.
      if ((parent.nodeType === 1 || parent.nodeType === 11) && parent.childNodes.length === nodes.length) {
        parent.textContent = ""
        return
      }
      for (const node of nodes) node.parentNode?.removeChild(node)
    },
    parentOf: (node) => node.parentNode ?? undefined,
    nextOf: (node) => node.nextSibling ?? undefined,
    setEvents(node, handlers, dispatch, options) {
      // An element with no events needs no entry, except a form: an entry marks it as the app's.
      if (isEmpty(handlers) && isEmpty(options) && node.nodeName !== "FORM") return stored.set(node, undefined)
      stored.set(node, { handlers, dispatch, options })
      listenFor(handlers, options)
    },
    events: { connect: stored.connect, listen: listenFor },
    elements: [Html.name],
    controlled,
    runsMounts: true,
    head: (head) => syncHead.sync(server.htmlHead(head)),
    hydration: {
      firstChild: (node) => node.firstChild ?? undefined,
      inspect(node) {
        switch (node.nodeType) {
          case 1: {
            const tag = (node as globalThis.Element).localName
            if (tag === "textarea") changedBefore.set(node, changedFromDefault(node as globalThis.Element))
            return { _tag: "Element", tag, textOnly: server.textOnlyTags.has(tag) }
          }
          case 3:
            return { _tag: "Text", text: (node as globalThis.Text).data }
          case 8:
            return markers.parse((node as globalThis.Comment).data) ?? { _tag: "Other" }
          default:
            return { _tag: "Other" }
        }
      },
      getAttr: (node, name) => (node as globalThis.Element).getAttribute(name) ?? undefined,
      adoptProp
    },
    commit() {
      changedBefore.clear()
      if (edited.size > 0) reportEdits()
      for (const dialog of shown) {
        if (!dialog.open || !dialog.isConnected) shown.delete(dialog)
      }
      if (modalWanted.size === 0) return showPopovers()
      const dialogs: Array<HTMLDialogElement> = []
      for (const dialog of modalWanted) {
        // A dialog that left the tree for good is forgotten. One that's back is shown again.
        if (!dialog.isConnected) modalWanted.delete(dialog)
        else dialogs.push(dialog)
      }
      // Document order: a dialog opens before one nested in it or after it, which then stacks on top.
      dialogs.sort((a, b) => (a.compareDocumentPosition(b) & 4) !== 0 ? -1 : 1)
      for (const dialog of dialogs) showDialog(dialog, "modal")
      showPopovers()
    },
    dispose: () => {
      syncHead.release()
      for (const [name, f] of listening) document.removeEventListener(name, f, { capture: true })
      listening.clear()
      document.removeEventListener("pointerdown", onPointerDown, { capture: true })
      cancelExitCheck()
      cancelOver()
      active = undefined
    }
  }
  return host
}

/**
 * The element operations behind `DomCommand.focus`, `blur`,
 * `scrollIntoView`, `measure`, `select` and `requestSubmit`, on DOM elements.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const htmlHost: Context.Service.Shape<typeof Html.Host> = {
  focus: (element, options) => (element as HTMLElement).focus(options as FocusOptions),
  blur: (element) => (element as HTMLElement).blur(),
  scrollIntoView: (element, options) => element.scrollIntoView(options as ScrollIntoViewOptions),
  measure: (element) => {
    const box = element.getBoundingClientRect()
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      left: box.left
    }
  },
  select: (element) => {
    const field = element as HTMLInputElement
    // Written first: the host would otherwise put a value `update` rejected back a frame later, which
    // drops the selection.
    const value = wanted.get(field)?.get("value")
    if (typeof value === "string" && field.value !== value) field.value = value
    if (typeof field.select === "function") field.select()
  },
  requestSubmit: (element) => {
    const form = element.localName === "form"
      ? element as HTMLFormElement
      : (element as HTMLInputElement).form ?? null
    if (form === null || typeof form.requestSubmit !== "function") return false
    form.requestSubmit()
    return true
  }
}

// Visibility follows `visibilitychange` only, never the window's `focus`. Connectivity
// starts true and follows `online` and `offline` on the document's own window.
const signals = (document: Document) => {
  const visibility = queryCore.makeSignal(document.visibilityState !== "hidden")
  const connectivity = queryCore.makeSignal(true)
  const view = document.defaultView
  const onVisibility = () => visibility.set(document.visibilityState !== "hidden")
  const onOnline = () => connectivity.set(true)
  const onOffline = () => connectivity.set(false)
  document.addEventListener("visibilitychange", onVisibility)
  view?.addEventListener("online", onOnline)
  view?.addEventListener("offline", onOffline)
  return {
    visibility,
    connectivity,
    dispose: () => {
      document.removeEventListener("visibilitychange", onVisibility)
      view?.removeEventListener("online", onOnline)
      view?.removeEventListener("offline", onOffline)
    }
  }
}

// `DomSubscription.onDocument` and `DomSubscription.onWindow` listen here. Each Subscription
// removes its own listener as it stops. A pointer payload's `pointerType` comes from the event alone.
const globalEventsOf = (document: Document): DomSubscription.GlobalEvents => ({
  listen: (target, name, { capture }, listener) => {
    const on = target === "document" ? document : document.defaultView
    if (on === null) return () => {}
    const f = (event: Event) =>
      listener(
        {
          ...(payloadOf(name, event, event.target, document.documentElement, undefined) as object),
          defaultPrevented: event.defaultPrevented
        },
        () => event.preventDefault()
      )
    on.addEventListener(name, f, { capture })
    return () => on.removeEventListener(name, f, { capture })
  }
})

// Loads in a detached <img>. A cached image may already be complete.
const imagesOf = (document: Document): DomImages.Images => ({
  load: (source) =>
    Effect.callback((resume) => {
      const image = document.createElement("img")
      const settle = (status: "loaded" | "error") => resume(Effect.succeed(status))
      if (source.referrerPolicy !== undefined) image.referrerPolicy = source.referrerPolicy
      image.crossOrigin = source.crossOrigin ?? null
      if (source.sizes !== undefined) image.sizes = source.sizes
      if (source.srcSet !== undefined) image.srcset = source.srcSet
      if (source.src !== undefined) image.src = source.src
      if (image.complete) return settle(image.naturalWidth > 0 ? "loaded" : "error")
      image.onload = () => settle("loaded")
      image.onerror = () => settle("error")
      return Effect.sync(() => {
        image.onload = null
        image.onerror = null
      })
    })
})

/**
 * Provides the DOM host as the `Renderer`, `Html.Host`, the document's
 * `Query.Visibility` and `Query.Connectivity`, its events as
 * `DomSubscription.GlobalEvents`, and a `DomImages.Images` over it, for the
 * life of the Layer.
 *
 * **Details**
 *
 * `document` defaults to the global `document`. Closing the Layer removes the
 * host's listeners. The signals, `DomSubscription.GlobalEvents` and
 * `DomImages.Images` use the document and its `defaultView`, never globals.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (options?: {
  readonly document?: Document | undefined
}): Layer.Layer<Renderer.Renderer | Html.Host> =>
  Layer.effectContext(Effect.gen(function*() {
    const document = options?.document ?? globalThis.document
    const host = makeHost(document)
    yield* Effect.addFinalizer(() => Effect.sync(host.dispose))
    const signal = signals(document)
    yield* Effect.addFinalizer(() => Effect.sync(signal.dispose))
    return Context.make(Renderer.Renderer, { host }).pipe(
      Context.add(Html.Host, htmlHost),
      Context.add(queryCore.Visibility, signal.visibility),
      Context.add(queryCore.Connectivity, signal.connectivity),
      Context.add(DomSubscription.GlobalEvents, globalEventsOf(document)),
      Context.add(DomImages.Images, imagesOf(document))
    )
  }))

/**
 * Passes when a root shows HTML or is host-neutral, and otherwise names the
 * host its vocabulary needs.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type HtmlRoot<V> = [Renderer.HostOf<V>] extends [Html.Host] ? unknown
  : { readonly "BrowserHost.mount shows HTML elements. This root's vocabulary needs": Renderer.HostOf<V> }

/**
 * The options of `mount` and `mountEffect`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MountOptions<V extends View.Elements, RF = never> {
  /** Shown in the root's place when the root itself fails. */
  readonly fallback?:
    | ((
      failure: AsyncResult.Failure<never, unknown>,
      h: View.Helper<never, {}> & View.Tags<V, never>
    ) => View.Content<never, RF>)
    | undefined
  /** The `state` of `HtmlServer.renderToHtml`, to hydrate the server's HTML. */
  readonly state?: Renderer.State | undefined
  readonly query?: Renderer.QueryOptions | undefined
  /**
   * Whether this mount owns the document head: `true` by default. A mount
   * embedded in a page that something else owns, such as a widget, passes
   * `false`: it computes its head and never writes `document.title` or a
   * head tag.
   */
  readonly head?: boolean | undefined
}

/**
 * A Layer that mounts a component tree into `container` for as long as the
 * Layer is built. It provides no service: launch it with `Layer.launch`, or
 * merge it into the app's Layer.
 *
 * **When to use**
 *
 * Use to run an app. Reach for `mountEffect` when the caller needs the root,
 * to send it messages or to wait for `root.adopted`.
 *
 * **Details**
 *
 * The root must render HTML (or be host-neutral): mounting a root of another
 * vocabulary is a type error. Nested components are checked when they mount,
 * and one of another vocabulary fails as a child. The tree's requirements
 * are the root's, minus `Html.Host`, which the host provides. When the root
 * itself fails, `fallback` is shown in its place.
 *
 * `props` may be an Effect, such as `Router.props(AppRoute)`. It runs once,
 * before `init`, and its requirements are added to the mount's, so a routed
 * app needs only this Layer and its Router's. A root's props therefore can't
 * themselves be an Effect.
 *
 * Commands and Subscriptions run on the default scheduler, the render flush
 * on a microtask. A navigation Command runs in the flush its `update` caused,
 * which renders the new route.
 *
 * **Hydration.** Pass the `state` from `HtmlServer.renderToHtml`, with the
 * server's HTML already in `container` and the same props, to adopt the
 * server's nodes instead of building them. `Router.props` gives the same
 * props on both sides when both Routers are at the same URL. Each instance adopts its server
 * Model and replays `init` only to recover its Commands; server Commands the
 * Model already has the result of are skipped, and those that missed the
 * budget run now. `onMount` fires on adoption. Where an instance's view stops
 * matching the server's nodes, the nodes before stay adopted and the rest is
 * built fresh, and an instance the server deferred is built fresh.
 *
 * An instance the server rendered with its provided Layer ready, whose
 * Layer is still building here, keeps the server's nodes until the Layer is
 * ready, and everything else is live at once. Its `LayerPending` entry says
 * `Awaiting`. One whose Layer was pending or failed on the server adopts at
 * once, and its feature slots keep the server's `fallback` nodes while their
 * status is the one the server shipped. A
 * waiting instance is inert: its buttons do nothing, links still navigate through
 * the Router, and a `<form>` submits natively. What the user types or picks
 * in its fields stays, and reaches the fields' `onInput` and `onChange` when
 * it adopts. Head sync starts once no instance is waiting.
 *
 * **The head.** The mount owns the document head: `<title>`, the marked
 * head tags and the `<html>` and `<body>` attributes follow the tree's
 * folded `HtmlHead`. A mount embedded in a page that another mount, or the
 * server, owns passes `head: false`: it still computes its head, and its
 * Router announces the title, but it leaves the document alone. With two
 * mounts on one document, only the one that owns the head writes it.
 *
 * **Example** (Launching an app)
 *
 * ```ts
 * import { BrowserHost, Html } from "@effect/ui/html"
 * import { Effect, Layer, Schema } from "effect"
 * import { Component } from "@effect/ui"
 *
 * const App = Component.define({
 *   name: "App",
 *   scoped: false,
 *   model: Schema.Struct({}),
 *   message: Schema.Never,
 *   elements: Html
 * }).make({
 *   init: () => ({}),
 *   update: (model) => model,
 *   view: (_, h) => h.h1("Hello")
 * })
 *
 * // In the browser entry module.
 * Effect.runFork(Layer.launch(BrowserHost.mount(App, {}, document.getElementById("app")!)))
 * ```
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const mount = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component: Component.Members<Name, Props, Model, Msg, Events, R, V, any> & HtmlRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  container: globalThis.Element,
  options?: MountOptions<V, RF>
): Layer.Layer<never, never, Exclude<R | RF | RP, Html.Host>> =>
  Layer.effectDiscard(mountEffect(component, props, container, options)) as any

/**
 * Mounts a component tree into `container` for the life of the current
 * Scope, and returns its root.
 *
 * **When to use**
 *
 * Use when the caller needs the root: to read its Model, send it a message,
 * or wait for `root.adopted`, which completes when no hydrating instance is still
 * waiting. `mount` is the form that runs an app.
 *
 * **Details**
 *
 * It mounts, checks the root and hydrates exactly as `mount` does.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const mountEffect = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component: Component.Members<Name, Props, Model, Msg, Events, R, V, any> & HtmlRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  container: globalThis.Element,
  options?: MountOptions<V, RF>
): Effect.Effect<Renderer.Root<Model, Msg>, never, Exclude<R | RF | RP, Html.Host> | Scope.Scope> =>
  Effect.gen(function*() {
    const context = yield* Layer.build(layer({ document: container.ownerDocument }))
    return yield* Effect.provideContext(Renderer.mount(component, props, container, options), context)
  }) as any
