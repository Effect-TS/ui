/**
 * The size of the app's window and of the screen, in points, with their
 * pixel density and font scale.
 *
 * **Details**
 *
 * `get` reads the current dimensions, `onChange` is a Subscription that
 * sends them when it starts and on each change, such as a rotation or a
 * window resized in split screen, and `changes` is a Stream of the
 * changes for code outside a component.
 *
 * `scale` is React Native's `PixelRatio.get()` and `fontScale` its
 * `PixelRatio.getFontScale()`. `roundToPixel` and `toPixels` take one.
 *
 * Off a device, `window` and `screen` are 0 by 0 with a scale and font
 * scale of 1.
 *
 * **Example** (Laying out by the window's width)
 *
 * ```ts
 * import { UiSchema } from "@effect/ui"
 * import * as Native from "@effect/ui-native/Native"
 * import { Dimensions } from "@effect/ui-native/kit"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ Resized: { width: Schema.Number } })
 *
 * const Layout = Native.component({
 *   name: "Layout",
 *   model: Schema.Struct({ width: Schema.Number }),
 *   message: Message
 * }).make({
 *   init: () => ({ width: 0 }),
 *   update: { Resized: ($, { width }) => $.evolve({ width }) },
 *   subscriptions: () => [
 *     Dimensions.onChange(({ window }) => Message.Resized({ width: window.width }))
 *   ],
 *   view: (h, model) => h.text.children(model.width > 600 ? "Wide" : "Narrow")
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Subscription from "@effect/ui/Subscription"
import type * as View from "@effect/ui/View"
import type * as Effect from "effect/Effect"
import type * as Stream from "effect/Stream"
import * as device from "./internal/device.ts"
import { dimensions } from "./internal/dimensions.ts"

/**
 * A size in points, with the pixels per point and the user's font scale.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Size {
  readonly width: number
  readonly height: number
  readonly scale: number
  readonly fontScale: number
}

/**
 * The app's window and the whole screen. They differ when the app shares
 * the screen, and on Android by the system bars.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Dimensions {
  readonly window: Size
  readonly screen: Size
}

/**
 * The current dimensions.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const get: Effect.Effect<Dimensions> = device.get(dimensions)

/**
 * A Subscription that sends `handler`'s message with the dimensions when it
 * starts, then with each change.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onChange = <Msg>(
  handler: View.Handler<Msg, Dimensions>
): Subscription.Subscription<Msg> =>
  device.onSource("@effect/ui-native/kit/Dimensions", dimensions, handler)

/**
 * The dimensions each time they change.
 *
 * @stability experimental
 * @category streams
 * @since 0.1.0
 */
export const changes: Stream.Stream<Dimensions> = device.changes(dimensions)

/**
 * Rounds a length in points to the nearest whole pixel at `scale`, so a
 * hairline lands on a pixel.
 *
 * @stability experimental
 * @category utils
 * @since 0.1.0
 */
export const roundToPixel = (points: number, scale: number): number =>
  Math.round(points * scale) / scale

/**
 * A length in points as whole pixels at `scale`, such as an image's size to
 * request.
 *
 * @stability experimental
 * @category utils
 * @since 0.1.0
 */
export const toPixels = (points: number, scale: number): number =>
  Math.round(points * scale)
