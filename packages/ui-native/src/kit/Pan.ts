/**
 * A pan gesture: an element that takes a touch once it moves far enough,
 * and follows it until it ends. It is React Native's gesture responder and
 * `PanResponder` in one.
 *
 * `Pan` is a view function. It keeps no state, so it takes no `key`.
 *
 * **Anatomy**
 *
 * `Pan` returns a single builder, `h.view` by default. Pass `element` to
 * use another element, or to stack it with `Pressable`. Chain styles and
 * children on the result.
 *
 * **Taking the touch**
 *
 * One element owns a touch at a time. A `Pan` takes it once the touch has
 * moved `threshold` points, 10 by default, along `axis` when set. With
 * `threshold: 0` and no `axis`, it takes the touch when it starts. If
 * `onStart` is given, it decides: a message takes the touch and
 * `undefined` leaves it, to be asked again on the next move.
 *
 * A `Pan` is asked before the pressables and pans inside it with
 * `capture: true`, and after them otherwise. Once an element owns the
 * touch, only the elements around it are asked, and only while it is
 * `cancelable`. Taking the touch ends the owner's: a `Pressable` gets
 * `onPressOut` and a `Pan` gets `onCancel`, before `onStart`.
 *
 * A scroll view that starts scrolling under a cancelable `Pan` takes the
 * touch, and the `Pan` gets `onCancel`. A native cancel always ends it,
 * and so does removing the element.
 *
 * With `blockNative`, the default, the owner stops the native views inside
 * it from handling the touch, and on Android stops a scroll view around it
 * from taking it.
 *
 * **Example** (A swipeable row)
 *
 * ```ts
 * import { Pan } from "@effect/ui-native/kit"
 *
 * Pan(h, {
 *   onMove: (g) => Message.Swiped({ dx: g.dx }),
 *   onEnd: (g) => Message.SwipeEnded({ vx: g.vx }),
 *   onCancel: Message.SwipeCancelled(),
 *   props: { axis: "x" }
 * }).children(row)
 * ```
 *
 * Each move is a message and a render, as with `PanResponder` and
 * `setState`.
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as View from "@effect/ui/View"
import {
  fire,
  pointOf,
  type Recognizer,
  touch,
  type TouchPayload
} from "../internal/touch.ts"
import type * as Native from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"
import { bind, ignore, pressed } from "./internal/view.ts"

/**
 * When the element takes a touch, and what that does.
 *
 * **Details**
 *
 * - `threshold`: points the touch moves before the element takes it, 10 by
 *   default. `0` takes it at the start.
 * - `axis`: the touch must move further along this axis than across it.
 * - `capture`: asked before the pressables and pans inside it.
 * - `cancelable`: whether an element around it or a scroll view can take
 *   the touch from it, `true` by default.
 * - `blockNative`: whether native views stop handling the touch while it
 *   owns it, `true` by default.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PanProps {
  readonly threshold?: number | undefined
  readonly axis?: "x" | "y" | undefined
  readonly capture?: boolean | undefined
  readonly cancelable?: boolean | undefined
  readonly blockNative?: boolean | undefined
}

/**
 * A gesture, as `PanResponder`'s gesture state, in points from the top
 * left of the screen.
 *
 * **Details**
 *
 * - `x0`, `y0`: where the touch started.
 * - `moveX`, `moveY`: where it is.
 * - `dx`, `dy`: how far it moved since it started. A finger going down
 *   or lifting doesn't move it.
 * - `vx`, `vy`: its speed at the last move, in points per millisecond.
 * - `numberActiveTouches`: the fingers down.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface Gesture {
  readonly x0: number
  readonly y0: number
  readonly moveX: number
  readonly moveY: number
  readonly dx: number
  readonly dy: number
  readonly vx: number
  readonly vy: number
  readonly numberActiveTouches: number
}

/**
 * A native builder that `Pan` accepts as `element` and returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PanElement<Msg> = Native.Element<Msg, any, any, any, any>

/**
 * Makes an element take touches that move. Call it with the caller's `h`,
 * then chain styles and children.
 *
 * **Details**
 *
 * `Pan` writes its handlers in `forward`, when the element is built. A
 * handler of the caller's own for a pan event throws at render.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Pan = <
  Msg,
  B extends PanElement<Msg> = Native.ViewElement<
    Msg,
    never,
    Native.ViewEvents,
    "view"
  >
>(
  h: {
    readonly view: Native.ViewElement<Msg, never, Native.ViewEvents, "view">
  },
  options: {
    /** The element to make a pan. `h.view` when left out. */
    readonly element?: B | undefined
    readonly props?: PanProps | undefined
    /** Decides whether to take the touch, with a message to take it. */
    readonly onStart?: View.Handler<NoInfer<Msg>, Gesture> | undefined
    readonly onMove?: View.Handler<NoInfer<Msg>, Gesture> | undefined
    /** The last finger lifted. */
    readonly onEnd?: View.Handler<NoInfer<Msg>, Gesture> | undefined
    /** Another element, a scroll view or native took the touch. */
    readonly onCancel?: View.Handler<NoInfer<Msg>, Gesture> | undefined
  }
): B => {
  touch.pan = pan
  const element: any = options.element ?? h.view
  return element.forward((node: any) =>
    bind(
      "Pan",
      node,
      {
        pan: options.onMove ?? ignore,
        panStart: options.onStart,
        panEnd: options.onEnd,
        panCancel: options.onCancel
      },
      "pan",
      options.props
    )
  )
}

const none: PanProps = {}

// The pan that owns the touch, and where the pans are asked from while
// none does: the element the touch pressed, else its target.
let owner: NativeNode | undefined
let from: NativeNode | undefined
let t = 0
const g = {
  x0: 0,
  y0: 0,
  moveX: 0,
  moveY: 0,
  dx: 0,
  dy: 0,
  vx: 0,
  vy: 0,
  numberActiveTouches: 0
}

const props = (n: NativeNode): PanProps =>
  (n.events!.options.pan as PanProps | undefined) ?? none

const responder = (n: NativeNode, is: boolean) => {
  if (n.shadow !== undefined) {
    n.host.ui.setIsJSResponder(n.shadow, is, props(n).blockNative !== false)
  }
}

const end = (event: string) => {
  const n = owner!
  owner = undefined
  responder(n, false)
  fire(n, event, { ...g })
}

const ready = (n: NativeNode) => {
  const { axis, threshold = 10 } = props(n)
  const x = Math.abs(g.dx)
  const y = Math.abs(g.dy)
  return axis === "x"
    ? x >= threshold && x > y
    : axis === "y"
    ? y >= threshold && y > x
    : Math.hypot(x, y) >= threshold
}

// Cancel the previous owner before sending the new owner's panStart message.
const take = (
  n: NativeNode,
  capture: boolean,
  payload: TouchPayload
): boolean => {
  if (
    n.events?.handlers.pan === undefined ||
    (props(n).capture === true) !== capture || !ready(n)
  ) return false
  const claim = () => {
    if (owner !== undefined) end("panCancel")
    else touch.press(3, n, payload)
    owner = n
    responder(n, true)
  }
  if (n.events.handlers.panStart === undefined) claim()
  else fire(n, "panStart", { ...g }, claim)
  return owner === n
}

const capture = (n: NativeNode | undefined, payload: TouchPayload): boolean =>
  n !== undefined && (capture(n.parent, payload) || take(n, true, payload))

// Asks the pans from `n` out: those with `capture` outermost first, then
// the others innermost first, up to `stop`.
const ask = (
  n: NativeNode | undefined,
  stop: NativeNode | undefined,
  payload: TouchPayload
) => {
  if (capture(n, payload)) return
  for (; n !== undefined && n !== stop; n = n.parent) {
    if (take(n, false, payload)) return
  }
}

const pan: Recognizer = (phase, n, payload) => {
  if (phase < 2) {
    const { x, y } = pointOf(payload)
    const now = payload?.touches?.[0]?.timestamp ?? Date.now()
    const count = payload?.touches?.length ?? 0
    if (phase === 0) {
      g.x0 = x
      g.y0 = y
      g.dx = g.dy = 0
      g.vx = g.vy = 0
    } else if (count === g.numberActiveTouches) {
      // Ignore coordinate jumps caused by a finger joining or leaving the gesture.
      if (now > t) {
        g.vx = (x - g.moveX) / (now - t)
        g.vy = (y - g.moveY) / (now - t)
      }
      g.dx += x - g.moveX
      g.dy += y - g.moveY
    }
    t = now
    g.moveX = x
    g.moveY = y
    g.numberActiveTouches = count
    if (phase === 0) {
      const press = pressed(n)
      from = press ?? n
      ask(n, press, payload)
    } else if (owner === undefined) ask(from, undefined, payload)
    else if (props(owner).cancelable !== false) {
      ask(owner.parent, undefined, payload)
    }
    if (owner !== undefined) {
      return phase === 1 && fire(owner, "pan", { ...g })
    }
  } else {
    from = undefined
    if (owner !== undefined) {
      if (phase === 4 && props(owner).cancelable === false) return false
      if (phase === 2) g.numberActiveTouches = 0
      return end(phase === 2 ? "panEnd" : "panCancel")
    }
  }
  return touch.press(phase, n, payload)
}
