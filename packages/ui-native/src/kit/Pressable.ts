/**
 * A pressable element, with the press states React Native's `Pressable`
 * has: `pressIn`, `pressOut`, `longPress`, a pressed style and the Android
 * ripple.
 *
 * `Pressable` is a view function. It keeps no state, so it takes no `key`.
 *
 * **Anatomy**
 *
 * `Pressable` returns a single builder, `h.view` by default. Pass `element`
 * to make another element pressable, such as `h.text`, or to stack it with
 * `Pan`. Chain styles and children on the result:
 * `Pressable(h, { onPress }).style(row).children(h.text(title))`.
 *
 * **Pressing**
 *
 * A touch that starts on the element presses it, unless a pressable inside
 * it takes the touch first. `onPressIn` fires when the touch starts and
 * `onPressOut` when it ends or moves out of the element, delayed until the
 * press has lasted 130 ms. Cancellation sends `onPressOut` immediately.
 * `onPress` fires when the touch ends on the element, unless `onLongPress`
 * fired first, which it does after 500 ms in place.
 * Moving back in presses the element again.
 *
 * The touch may end up to `pressRetentionOffset` outside the element, 20
 * points on each side by default, and `hitSlop` grows the area a touch
 * can start in. A scroll view that starts scrolling, a `Pan` that takes the
 * touch, a native cancel or removing the element ends the press without
 * `onPress`.
 *
 * `pressedStyle` is shown while the element is pressed, without a message
 * or a render. To change anything else while pressed, such as children,
 * keep a `pressed` flag in the Model from `onPressIn` and `onPressOut`.
 *
 * **Hovering**
 *
 * `onHoverIn` and `onHoverOut` handle the element's `pointerEnter` and
 * `pointerLeave` events. Enable React Native's W3C pointer events at app
 * launch as described in `Native.ViewEvents`.
 *
 * **Disabled**
 *
 * A disabled `Pressable` has no handlers and `accessibilityState.disabled`,
 * so a touch on it presses the pressable around it, as in React Native.
 *
 * **Example** (A list row)
 *
 * ```ts
 * import { Pressable } from "@effect/ui-native/kit"
 *
 * Pressable(h, {
 *   onPress: Message.Opened({ id }),
 *   onLongPress: Message.Selected({ id }),
 *   props: { pressedStyle: { opacity: 0.6 }, android_ripple: { color: "#0002" } }
 * }).style(row).children(h.text(title))
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as View from "@effect/ui/View"
import { props as setters } from "../internal/kinds.ts"
import { touch } from "../internal/touch.ts"
import type * as Native from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"
import { press, type PressOptions } from "./internal/press.ts"
import { bind, ignore, insets } from "./internal/view.ts"

/**
 * Space around an element, in points: the same on each side, or by side.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Slop = number | Native.Insets

/**
 * The Android ripple, as React Native's `android_ripple`. It shows when
 * `color`, `borderless` or `radius` is set.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Ripple {
  readonly color?: Native.Color | undefined
  readonly borderless?: boolean | undefined
  readonly radius?: number | undefined
  /** Draws the ripple over the children instead of behind them. */
  readonly foreground?: boolean | undefined
  readonly alpha?: number | undefined
}

/**
 * How the element presses.
 *
 * **Details**
 *
 * - `disabled`: no press events, and `accessibilityState.disabled`.
 * - `hitSlop`: how far outside the element a touch can start.
 * - `pressRetentionOffset`: how far beyond `hitSlop` a touch can move
 *   and stay pressed, 20 points by default.
 * - `delayLongPress`: milliseconds before `onLongPress`, 500 by default.
 * - `pressedStyle`: style shown while pressed.
 * - `android_ripple`: the Android ripple.
 * - `android_disableSound`: no touch sound on Android when pressed.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PressableProps {
  readonly disabled?: boolean | undefined
  readonly hitSlop?: Slop | undefined
  readonly pressRetentionOffset?: Slop | undefined
  readonly delayLongPress?: number | undefined
  readonly pressedStyle?: Native.ViewStyle | undefined
  readonly android_ripple?: Ripple | undefined
  readonly android_disableSound?: boolean | undefined
}

/**
 * A native builder that `Pressable` accepts as `element` and returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PressableElement<Msg> = Native.Element<Msg, any, any, any, any>

// The ripple goes through kit-private props, whose setters process its
// colour, so the native props given directly stay as written.
const setRipple =
  (name: string) => (n: NativeNode, ripple: any, host: Native.ViewHost) =>
    host.set(
      n,
      name,
      ripple && {
        type: "RippleAndroid",
        color: host.color(ripple.color),
        borderless: ripple.borderless === true,
        rippleRadius: ripple.radius,
        alpha: ripple.alpha ?? null
      }
    )
const background = /* @__PURE__ */ setRipple("nativeBackgroundAndroid")
const foreground = /* @__PURE__ */ setRipple("nativeForegroundAndroid")

/**
 * Makes an element pressable. Call it with the caller's `h`, then chain
 * styles and children.
 *
 * **Details**
 *
 * `Pressable` writes its handlers and props in `forward`, when the element
 * is built, so they win over the caller's: `hitSlop`, the ripple and, when
 * disabled, `accessibilityState`. A handler of the caller's own for an
 * event `Pressable` handles throws at render: pass it as an option.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Pressable = <
  Msg,
  B extends PressableElement<Msg> = Native.ViewElement<
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
    /** The element to make pressable. `h.view` when left out. */
    readonly element?: B | undefined
    readonly props?: PressableProps | undefined
    readonly onPress?:
      | View.Handler<NoInfer<Msg>, Native.PressPayload>
      | undefined
    readonly onPressIn?:
      | View.Handler<NoInfer<Msg>, Native.PressPayload>
      | undefined
    readonly onPressOut?:
      | View.Handler<NoInfer<Msg>, Native.PressPayload>
      | undefined
    readonly onLongPress?:
      | View.Handler<NoInfer<Msg>, Native.PressPayload>
      | undefined
    readonly onHoverIn?:
      | View.Handler<NoInfer<Msg>, Native.PointerPayload>
      | undefined
    readonly onHoverOut?:
      | View.Handler<NoInfer<Msg>, Native.PointerPayload>
      | undefined
  } = {}
): B => {
  touch.press = press
  setters.set("ripple:background", background)
  setters.set("ripple:foreground", foreground)
  const element: any = options.element ?? h.view
  const props = options.props ?? {}
  return element.forward((node: any) => {
    if (props.disabled === true) {
      return node.prop("accessibilityState", {
        ...node.props.accessibilityState,
        disabled: true
      })
    }
    const hitSlop = insets(props.hitSlop)
    const offset = insets(props.pressRetentionOffset ?? 20)!
    const side = (name: keyof Native.Insets) =>
      (hitSlop?.[name] ?? 0) + (offset[name] ?? 0)
    const ripple = props.android_ripple
    const rippled = ripple !== undefined &&
      (ripple.color ?? ripple.borderless ?? ripple.radius) !== undefined
    let out = bind(
      "Pressable",
      node,
      {
        press: options.onPress,
        pressIn: options.onPressIn ?? ignore,
        pressOut: options.onPressOut,
        longPress: options.onLongPress,
        pointerEnter: options.onHoverIn,
        pointerLeave: options.onHoverOut
      },
      "pressIn",
      {
        pressedStyle: props.pressedStyle,
        retention: [side("left"), side("top"), side("right"), side("bottom")],
        delayLongPress: props.delayLongPress,
        ripple: rippled,
        sound: props.android_disableSound !== true
      } satisfies PressOptions
    )
    if (hitSlop !== undefined) out = out.prop("hitSlop", hitSlop)
    return rippled
      ? out.prop(
        ripple.foreground === true ? "ripple:foreground" : "ripple:background",
        ripple
      )
      : out
  })
}
