import { perDocument } from "./dom.ts"
import { onPressClick } from "./interaction.ts"
import { isAndroid } from "./platform.ts"
import { frameOf } from "./transition.ts"

// What a layer can take: a reason to dismiss it, or the focus, which a
// dialog keeps inside it with Tab and moves into it as it opens.
export type Claim =
  | "escape-key"
  | "outside-press"
  | "focus-out"
  | "close-watcher"
  | "focus"

type CloseWatcher = EventTarget & { readonly destroy: () => void }

export interface Layer {
  readonly node: HTMLElement
  readonly open: () => boolean
  readonly takes: (claim: Claim) => boolean
  // Android's back gesture asked to close it.
  readonly cancelled: () => void
}

export interface Stack {
  readonly document: Document
  readonly layers: Array<Layer>
  watched: { readonly layer: Layer; readonly watcher: CloseWatcher } | undefined
  pressed: PointerEvent | undefined
}

export const stackOf = perDocument((document): Stack => ({
  document,
  layers: [],
  watched: undefined,
  pressed: undefined
}))

// A press outside that a layer took, kept until its gesture ends, also when
// the layer closes on it, so the focus it moves, from a click handler too,
// doesn't count as focus leaving any layer. A cancelled press ends it.
export const claimPress = (
  stack: Stack,
  press: PointerEvent,
  clicked?: (click: MouseEvent) => void
): void => {
  stack.pressed = press
  onPressClick(stack.document, press, (click, end) => {
    // A label forwards its click to its field, so a tap can click twice.
    clicked?.(click)
    clicked = undefined
    setTimeout(end, 0)
  }, () => {
    if (stack.pressed === press) stack.pressed = undefined
  })
}

let handing = 0

// Focus the kit moves itself, which doesn't count as focus leaving a layer.
export const handOff = (
  element: HTMLElement | null | undefined,
  visible = false
): void => {
  if (element == null) return
  // Never `false`, which hides a focus ring the browser would draw.
  const focusVisible = visible || undefined
  handing++
  try {
    element.focus({ preventScroll: true, focusVisible } as FocusOptions)
  } finally {
    handing--
  }
}

// A layer inside another one's node is above it, otherwise the later one is.
// Focus that the kit or a claimed press moves leaves no layer.
const topOf = (stack: Stack, claim: Claim): Layer | undefined =>
  claim === "focus-out" && (handing > 0 || stack.pressed !== undefined)
    ? undefined
    : stack.layers.reduce<Layer | undefined>(
      (top, layer) =>
        !layer.open() || !layer.takes(claim)
          ? top
          : top === undefined || top.node.contains(layer.node) ||
              !layer.node.contains(top.node)
          ? layer
          : top,
      undefined
    )

const decided = new WeakMap<Event, Layer | undefined>()

// Decided once per event, which asks for one claim, so a layer that closes
// while the event runs doesn't hand it on to the one below.
export const topFor = (
  stack: Stack,
  claim: Claim,
  event?: Event
): Layer | undefined => {
  if (event === undefined) return topOf(stack, claim)
  if (!decided.has(event)) decided.set(event, topOf(stack, claim))
  return decided.get(event)
}

// Android's back gesture. Elsewhere a `CloseWatcher` would also take Escape.
const watch = (stack: Stack, layer: Layer): CloseWatcher | undefined => {
  const view = stack.document.defaultView
  const Watcher = isAndroid(view)
    ? (view as Window & { readonly CloseWatcher?: new() => CloseWatcher })
      .CloseWatcher
    : undefined
  if (Watcher === undefined) return undefined
  const watcher = new Watcher()
  watcher.addEventListener("cancel", (event) => {
    if (event.cancelable) event.preventDefault()
    layer.cancelled()
  })
  watcher.addEventListener("close", () => {
    if (stack.watched?.watcher !== watcher) return
    stack.watched = undefined
    frameOf(view)(() => rewatch(stack))
  })
  return watcher
}

export const rewatch = (stack: Stack): void => {
  const top = topOf(stack, "close-watcher")
  if (stack.watched?.layer === top) return
  stack.watched?.watcher.destroy()
  const watcher = top && watch(stack, top)
  stack.watched = top !== undefined && watcher !== undefined
    ? { layer: top, watcher }
    : undefined
}

// The layer is in the stack until the signal aborts.
export const join = (stack: Stack, layer: Layer, signal: AbortSignal): void => {
  stack.layers.push(layer)
  rewatch(stack)
  signal.addEventListener("abort", () => {
    stack.layers.splice(stack.layers.indexOf(layer), 1)
    rewatch(stack)
  })
}
