import type { NativeNode } from "../NativeHost.ts"
import { blurFocused, focus } from "./focus.ts"
import { kinds, persistTaps } from "./kinds.ts"
import { mounted, rootOf } from "./node.ts"

/**
 * The touch payload Fabric sends with `topTouch*`.
 *
 * @internal
 */
export interface TouchPayload {
  readonly touches?: ReadonlyArray<Touch> | undefined
  readonly changedTouches?: ReadonlyArray<Touch> | undefined
}

/** @internal */
export interface Touch {
  readonly pageX?: number | undefined
  readonly pageY?: number | undefined
  readonly timestamp?: number | undefined
}

/**
 * What happened to the touch:
 *
 * - `0`: it started, on `target`.
 * - `1`: a finger moved, went down or lifted, and others are still down.
 * - `2`: the last finger lifted.
 * - `3`: native cancelled it.
 * - `4`: a scroll view around it started dragging.
 *
 * @internal
 */
export type Phase = 0 | 1 | 2 | 3 | 4

/**
 * Turns touches into events. One touch is recognized at a time: it starts
 * with the first finger down and ends when the last lifts. Returning
 * `false` at phase `4` keeps the touch from the scroll view.
 *
 * @internal
 */
export type Recognizer = (
  phase: Phase,
  target: NativeNode,
  payload: TouchPayload
) => unknown

let pressed: NativeNode | undefined

/**
 * The recognizers in use. `press` sends `press` to the nearest element
 * that handles it, when the touch ends within 20 points of it. The kit's
 * `Pressable` replaces it, and its `Pan` sets `pan`, which gets the touch
 * in place of `press`.
 *
 * @internal
 */
export const touch: { press: Recognizer; pan?: Recognizer | undefined } = {
  press(phase, n, payload) {
    if (phase === 0) {
      let p: NativeNode | undefined = n
      while (p !== undefined && p.events?.handlers.press === undefined) {
        p = p.parent
      }
      pressed = p
    } else if (phase !== 1) {
      const target = pressed
      pressed = undefined
      if (phase === 2 && under(n, target)) {
        const { x, y } = pointOf(payload)
        if (within(rectOf(target), x, y)) fire(target, "press", { x, y })
      }
    }
  }
}

/**
 * Whether `n` is `ancestor` or inside it.
 *
 * @internal
 */
export const under = (
  n: NativeNode | undefined,
  ancestor: NativeNode | undefined
): ancestor is NativeNode => {
  while (n !== undefined && n !== ancestor) n = n.parent
  return n !== undefined
}

/**
 * Where the touch is: its first finger still down, else the one that lifted.
 *
 * @internal
 */
export const pointOf = (
  payload: TouchPayload
): { readonly x: number; readonly y: number } => {
  const touch = payload?.touches?.[0] ?? payload?.changedTouches?.[0]
  return { x: touch?.pageX ?? 0, y: touch?.pageY ?? 0 }
}

/**
 * The node's left, top, width and height on screen, with transforms unless
 * `transform` is `false`.
 *
 * @internal
 */
export const rectOf = (
  n: NativeNode,
  transform = true
): ReadonlyArray<number> | null | undefined =>
  n.shadow === undefined
    ? undefined
    : n.host.ui.getBoundingClientRect(n.shadow, transform)

/**
 * Whether `x, y` is inside `rect` grown by the given points on each side,
 * 20 by default as React Native's `Pressable` allows. A node native hasn't
 * measured contains every point.
 *
 * @internal
 */
export const within = (
  rect: ReadonlyArray<number> | null | undefined,
  x: number,
  y: number,
  left = 20,
  top = left,
  right = left,
  bottom = left
): boolean =>
  rect == null ||
  x >= rect[0]! - left && x <= rect[0]! + rect[2]! + right &&
    y >= rect[1]! - top && y <= rect[1]! + rect[3]! + bottom

/**
 * Runs the node's own handler for `event`, returning whether it sent a
 * message. `onMessage` runs before the message is sent.
 *
 * @internal
 */
export const fire = (
  n: NativeNode,
  event: string,
  payload: unknown,
  onMessage?: (() => void) | undefined
): boolean => {
  const handler = n.events?.handlers[event]
  return handler !== undefined &&
    n.events!.dispatch(event, handler, payload, onMessage)
}

// When each scroll view stopped coasting, or `Infinity` while it coasts.
const coasting = new WeakMap<NativeNode, number>()

let target: NativeNode | undefined
let taken = false
/**
 * Whether a `"handled"` scroll view takes the touch's press while leaving
 * it to the pans, which press nothing then.
 *
 * @internal
 */
export let fenced = false
// Whether the touch blurs the focused input when it ends: `1` unless a
// scroll view around its target scrolls first, `2` regardless.
let blur: 0 | 1 | 2 = 0
// The target of a touch whose element was removed, until it is cancelled.
let dropped: NativeNode | undefined

// A handler that takes a touch as it starts, as React Native's responders do.
const claims = (n: NativeNode) => {
  const h = n.events?.handlers
  return h !== undefined && (h.press ?? h.pressIn) !== undefined
}

/**
 * Called by a recognizer that takes the touch, such as a `Pan` once it
 * moves, so a `"handled"` scroll view keeps the keyboard up.
 *
 * @internal
 */
export const own = (): void => {
  if (blur === 1) blur = 0
}

/**
 * Applies `keyboardShouldPersistTaps` of the scroll views around a touch
 * that starts on `n`, as React Native's `ScrollView` does while the
 * keyboard can be dismissed. Returns `1` when one takes the touch, and `2`
 * when one takes only its press.
 *
 * A `"never"` scroll view takes a touch that doesn't start on an input. A
 * `"handled"` one takes it when nothing inside it handles a press, but only
 * its press when a `Pan` inside can take a drag. Either way the focused
 * input is blurred when the touch ends, unless the scroll view scrolls or
 * the `Pan` takes the touch. A keyboard of height 0, which doesn't cover
 * the app, lets a `"never"` scroll view's touch through to the elements
 * and blurs when it ends, as React Native's `ScrollView` does.
 */
const persist = (n: NativeNode): 0 | 1 | 2 => {
  const input = kinds.get("input")
  const focused = focus.node
  if (
    focused === undefined || focused.kind !== input || !mounted(focused) ||
    (focus.keyboard === undefined && !focus.unreliable) || n === focused
  ) return 0
  const scroll = kinds.get("scroll")
  const detached = focus.keyboard === 0
  let handled = n.kind === input
  let pan = false
  let take = false
  let fence = false
  for (let p: NativeNode | undefined = n; p !== undefined; p = p.parent) {
    if (p.kind === scroll) {
      const mode = persistTaps.get(p) ?? "never"
      if (mode === "never" && n.kind !== input) {
        if (detached) blur = 2
        else {
          blur ||= 1
          take = true
        }
      } else if (mode === "handled" && !handled) {
        blur ||= 1
        if (pan) fence = true
        else take = true
        handled = true
      }
    }
    handled ||= claims(p)
    pan ||= p.events?.handlers.pan !== undefined
  }
  return take ? 1 : fence ? 2 : 0
}

const cancel = () => {
  const t = dropped
  dropped = undefined
  if (t !== undefined) recognize(3, t, {})
}

/**
 * Routes touch and scroll events to the recognizer. The events still reach
 * the target's hooks and handlers.
 *
 * **Details**
 *
 * A touch that starts in a scroll view that is coasting, or stopped within
 * a frame, only stops the scroll, as React Native's `ScrollView` takes it.
 * A scroll view that starts dragging under a touch takes it from the
 * recognizer, which iOS doesn't report as a cancel. Either way nothing
 * else gets the touch until the last finger lifts.
 *
 * @internal
 */
export const route = (n: NativeNode, type: string, payload: any): void => {
  cancel()
  if (!type.startsWith("topTouch")) {
    if (type === "topMomentumScrollBegin") coasting.set(n, Infinity)
    else if (type === "topMomentumScrollEnd") coasting.set(n, Date.now())
    else if (type === "topScrollBeginDrag" || type === "topScroll") {
      if (!under(target, n)) return
      if (blur === 1) blur = 0
      if (type === "topScrollBeginDrag" && !taken) {
        taken = recognize(4, n, payload) !== false
      }
    }
    return
  }
  let phase: Phase = 0
  if (target !== undefined) {
    // An event from another surface, or a removed view, isn't this touch's.
    if (rootOf(n) !== rootOf(target)) return
    phase = type === "topTouchCancel"
      ? 3
      : type === "topTouchEnd" && !(payload?.touches?.length > 0)
      ? 2
      : 1
  } else if (type === "topTouchStart") {
    target = n
    const now = Date.now()
    for (let p: NativeNode | undefined = n; p !== undefined; p = p.parent) {
      if (now - coasting.get(p)! < 16) taken = true
    }
    if (!taken) {
      const kept = persist(n)
      taken = kept === 1
      fenced = kept === 2
    }
  } else return
  if (!taken) recognize(phase, n, payload)
  if (phase > 1) {
    if (phase === 2 && blur !== 0) blurFocused()
    target = undefined
    taken = fenced = false
    blur = 0
  }
}

/**
 * Cancels the touch when `n`, which is leaving the tree, holds its target.
 * Native may never end a touch on a removed view. The cancel runs after the
 * render that removes it, or before the next event if that comes first, and
 * the next touch starts afresh.
 *
 * @internal
 */
export const drop = (n: NativeNode) => {
  const t = target
  if (t === undefined || !under(t, n)) return
  if (!taken) {
    dropped = t
    queueMicrotask(cancel)
  }
  target = undefined
  taken = fenced = false
  blur = 0
}

const recognize: Recognizer = (phase, n, payload) =>
  (touch.pan ?? touch.press)(phase, n, payload)
