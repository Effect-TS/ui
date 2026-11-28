import type * as View from "@effect/ui/View"
import NativeSoundManager from "react-native/Libraries/Components/Sound/NativeSoundManager"
import { isColor, markDirty, mounted } from "../../internal/node.ts"
import {
  fire,
  pointOf,
  pressed,
  type Recognizer,
  rectOf,
  under,
  within
} from "../../internal/touch.ts"
import type { ViewStyle } from "../../Native.ts"
import type { NativeNode } from "../../NativeHost.ts"

/**
 * How `Pressable` presses, stored as the options of its `pressIn` handler.
 *
 * @internal
 */
export interface PressOptions extends View.EventOptions {
  readonly pressedStyle?: ViewStyle | undefined
  /**
   * How far a touch may move outside the element and stay pressed: to the
   * left, top, right and bottom.
   */
  readonly retention?: readonly [number, number, number, number] | undefined
  readonly delayLongPress?: number | undefined
  readonly ripple?: boolean | undefined
  readonly sound?: boolean | undefined
}

// React Native's `Pressability` timings.
const minPress = 130
const longPress = 500
const longPressSlop = 10

const none: PressOptions = {}

let owner: NativeNode | undefined
let options = none
let rect: ReadonlyArray<number> | null | undefined
let ripple = false
let inside = false
let x0 = 0
let y0 = 0
let pressedAt = 0
let longTimer: ReturnType<typeof setTimeout> | undefined
let longPressed = false
// A `pressOut` held back until the press has shown for `minPress`.
let out: (() => void) | undefined
let outTimer: ReturnType<typeof setTimeout> | undefined

const flush = () => {
  clearTimeout(outTimer)
  out?.()
}

// Only `pending` changes, so a render never sees the pressed values.
const paint = (n: NativeNode, style: ViewStyle | undefined, on: boolean) => {
  if (style === undefined || n.shadow === undefined) return
  const pending = n.pending ??= {}
  for (const key in style) {
    const value = style[key as keyof ViewStyle]
    pending[key] = on
      ? isColor.test(key) ? n.host.color(value) : value
      : n.props[key] ?? null
  }
  markDirty(n)
}

const send = (
  n: NativeNode,
  event: string,
  x: number,
  y: number,
  style: ViewStyle | undefined
) => {
  fire(n, event, { x, y })
  // Commit after any render scheduled by the handler so it includes the pressed style.
  if (style !== undefined) queueMicrotask(n.host.commit)
}

const spot = (n: NativeNode, x: number, y: number) =>
  n.host.command(n, "hotspotUpdate", [x - rect![0]!, y - rect![1]!])

const activate = (n: NativeNode, x: number, y: number) => {
  flush()
  inside = true
  pressedAt = Date.now()
  const style = options.pressedStyle
  paint(n, style, true)
  if (ripple) {
    spot(n, x, y)
    n.host.command(n, "setPressed", [true])
  }
  send(n, "pressIn", x, y, style)
}

const deactivate = (n: NativeNode, x: number, y: number, now = false) => {
  inside = false
  const style = options.pressedStyle
  const rippled = ripple
  const run = () => {
    out = undefined
    if (mounted(n)) {
      paint(n, style, false)
      if (rippled) n.host.command(n, "setPressed", [false])
    }
    send(n, "pressOut", x, y, style)
  }
  const wait = minPress - (Date.now() - pressedAt)
  if (wait > 0 && !now) {
    out = run
    outTimer = setTimeout(run, wait)
  } else run()
}

/**
 * Recognizes presses with `pressIn`, `pressOut` and `longPress`.
 *
 * @internal
 */
export const press: Recognizer = (phase, target, payload) => {
  const { x, y } = pointOf(payload)
  if (phase === 0) {
    flush()
    const n = owner = pressed(target)
    if (n === undefined) return
    options = (n.events!.options.pressIn as PressOptions | undefined) ?? none
    rect = rectOf(n)
    ripple = options.ripple === true && rect != null && n.host.os === "android"
    longPressed = false
    x0 = x
    y0 = y
    activate(n, x, y)
    if (n.events!.handlers.longPress !== undefined) {
      longTimer = setTimeout(() => {
        if (owner === n && inside) {
          longPressed = true
          fire(n, "longPress", { x, y })
        }
      }, options.delayLongPress ?? longPress)
    }
    return
  }
  // Flush delayed pressOut before another gesture takes ownership.
  if (phase > 2) flush()
  const n = owner
  if (n === undefined) return
  if (phase === 1) {
    if (Math.hypot(x - x0, y - y0) > longPressSlop) clearTimeout(longTimer)
    const isIn = within(rect, x, y, ...(options.retention ?? []))
    if (isIn !== inside) (isIn ? activate : deactivate)(n, x, y)
    else if (inside && ripple) spot(n, x, y)
    return
  }
  owner = undefined
  clearTimeout(longTimer)
  if (!inside) return
  if (phase > 2) return deactivate(n, x0, y0, true)
  deactivate(n, x, y)
  if (
    under(target, n) && within(rect, x, y, ...(options.retention ?? [])) &&
    !(longPressed && n.events?.handlers.longPress !== undefined)
  ) {
    if (options.sound && n.host.os === "android") {
      NativeSoundManager?.playTouchSound()
    }
    fire(n, "press", { x, y })
  }
}
