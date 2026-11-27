/**
 * A container `view` with an absolutely positioned {@link Image} behind its
 * children.
 *
 * `ImageBackground` returns a `ViewElement` builder: chain `.style(...)`,
 * `.on(...)` and `.children(...)` on the result. Any children added with
 * `.children(...)` render on top of the background image.
 *
 * **Example** (Text over a background image)
 *
 * ```ts
 * import { Native } from "@effect/ui-native"
 * import { ImageBackground } from "@effect/ui-native/kit"
 * import { Schema } from "effect"
 *
 * export const Banner = Native.component({
 *   name: "Banner",
 *   model: Schema.Null,
 *   message: Schema.Never
 * }).make({
 *   init: () => null,
 *   update: ($) => $.model,
 *   view: (h) =>
 *     ImageBackground(h, {
 *       source: "https://example.com/banner.png",
 *       imageStyle: { opacity: 0.5 }
 *     })
 *       .style({ flex: 1 })
 *       .children(h.text("Over the image"))
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Native from "../Native.ts"
import { Image, type ImageOptions, type ImageStyle } from "./Image.ts"

/**
 * Options accepted by {@link ImageBackground}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ImageBackgroundOptions extends ImageOptions {
  /** Style applied to the underlying `Image`. */
  readonly imageStyle?: ImageStyle | undefined
}

/**
 * Renders a `view` whose first child is an absolutely positioned `Image`
 * filling the container. Chain `.style(...)` and `.children(...)` on the
 * returned builder.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const ImageBackground = <Msg>(
  h: Native.H<Msg>,
  options: ImageBackgroundOptions
): Native.ViewElement<Msg, never, Native.ViewEvents, "view"> => {
  const { imageStyle, ...imageOptions } = options
  const background = Image(h, imageOptions).style({
    // Clear an asset's intrinsic size so the insets fill the container.
    width: undefined,
    height: undefined,
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    ...imageStyle
  })
  return h.view.children(background)
}
