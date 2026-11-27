import { perDocument } from "./dom.ts"
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
  readonly watch: () => CloseWatcher | undefined
}

export interface Press {
  readonly layer: Layer
  readonly pointerType: string
  // A label forwards its click to its field, so a tap can click twice.
  clicked: boolean
}

export interface Stack {
  readonly layers: Array<Layer>
  watched: { readonly layer: Layer; readonly watcher: CloseWatcher } | undefined
  pressed: Press | undefined
}

export const stackOf = perDocument((): Stack => ({
  layers: [],
  watched: undefined,
  pressed: undefined
}))

// A press outside that a layer took, kept until its gesture ends, also when
// the layer closes on it, so the focus it moves, from a click handler too,
// doesn't count as focus leaving any layer. A cancelled press ends it.
export const claimPress = (
  stack: Stack,
  event: PointerEvent,
  layer: Layer
): void => {
  const press: Press = { layer, pointerType: event.pointerType, clicked: false }
  stack.pressed = press
  const done = new AbortController()
  const options = { capture: true, signal: done.signal }
  const end = () => {
    done.abort()
    if (stack.pressed === press) stack.pressed = undefined
  }
  const own = (next: PointerEvent) => next.pointerId === event.pointerId
  const document = (event.target as Node).ownerDocument!
  document.addEventListener(
    "pointerdown",
    (next) => next !== event && end(),
    options
  )
  document.addEventListener(
    "pointercancel",
    (next) => own(next) && end(),
    options
  )
  document.addEventListener("pointerup", (next) => {
    if (own(next)) setTimeout(end, 400)
  }, options)
  document.addEventListener("click", () => setTimeout(end, 0), options)
}

// A layer inside another one's node is above it, otherwise the later one is.
const topOf = (stack: Stack, claim: Claim): Layer | undefined =>
  stack.layers.reduce<Layer | undefined>(
    (top, layer) =>
      !layer.open() || !layer.takes(claim)
        ? top
        : top === undefined || top.node.contains(layer.node) ||
            !layer.node.contains(top.node)
        ? layer
        : top,
    undefined
  )

const decided = new WeakMap<Event, Map<Claim, Layer | undefined>>()

// Decided once per event, so a layer that closes while the event runs
// doesn't hand it on to the one below.
export const topFor = (
  stack: Stack,
  claim: Claim,
  event?: Event
): Layer | undefined => {
  if (event === undefined) return topOf(stack, claim)
  let tops = decided.get(event)
  if (tops === undefined) decided.set(event, tops = new Map())
  if (!tops.has(claim)) tops.set(claim, topOf(stack, claim))
  return tops.get(claim)
}

export const rewatch = (stack: Stack): void => {
  const top = topOf(stack, "close-watcher")
  if (stack.watched?.layer === top) return
  stack.watched?.watcher.destroy()
  const watcher = top?.watch()
  stack.watched = top !== undefined && watcher !== undefined
    ? { layer: top, watcher }
    : undefined
}

export const join = (stack: Stack, layer: Layer): () => void => {
  stack.layers.push(layer)
  rewatch(stack)
  return () => {
    stack.layers.splice(stack.layers.indexOf(layer), 1)
    rewatch(stack)
  }
}

// Android's back gesture. Elsewhere a `CloseWatcher` would also take Escape.
export const watcherOf = (
  stack: Stack,
  view: Window | null,
  cancelled: () => void
): () => CloseWatcher | undefined => {
  const Watcher = view !== null && isAndroid(view)
    ? (view as Window & { readonly CloseWatcher?: new() => CloseWatcher })
      .CloseWatcher
    : undefined
  return () => {
    if (Watcher === undefined) return undefined
    const watcher = new Watcher()
    watcher.addEventListener("cancel", (event) => {
      if (event.cancelable) event.preventDefault()
      cancelled()
    })
    watcher.addEventListener("close", () => {
      if (stack.watched?.watcher !== watcher) return
      stack.watched = undefined
      frameOf(view)(() => rewatch(stack))
    })
    return watcher
  }
}

let handing = 0

// Focus the kit moves itself, which doesn't count as focus leaving a layer.
export const handingOff = (): boolean => handing > 0

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
