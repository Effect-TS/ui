/**
 * Displays remote, local and bundled images over Fabric's `RCTImageView`.
 *
 * `Image` is a view function returning an {@link ImageElement} builder. Chain
 * `.style(...)` and `.on(...)` on the result.
 *
 * **Example** (A remote image with a load handler)
 *
 * ```ts
 * import { UiSchema } from "@effect/ui"
 * import { Native } from "@effect/ui-native"
 * import { Image } from "@effect/ui-native/kit"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({
 *   Loaded: { width: Schema.Number, height: Schema.Number }
 * })
 *
 * export const Avatar = Native.component({
 *   name: "Avatar",
 *   model: Schema.Null,
 *   message: Message
 * }).make({
 *   init: () => null,
 *   update: { Loaded: ($) => $.model },
 *   view: (h) =>
 *     Image(h, { source: "https://example.com/avatar.png" })
 *       .style({ width: 64, height: 64, resizeMode: "contain" })
 *       .on("load", ({ source }) =>
 *         Message.Loaded({ width: source.width, height: source.height })
 *       )
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import { getAssetByID } from "react-native/asset-registry"
import * as Native from "../Native.ts"
import { resolveAsset } from "./internal/asset.ts"

/**
 * How an image fits inside its frame.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ImageResizeMode =
  | "cover"
  | "contain"
  | "stretch"
  | "repeat"
  | "center"
  | "none"

/**
 * How Android resizes an image when its dimensions differ from the view's.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ImageResizeMethod = "auto" | "resize" | "scale" | "none"

/**
 * The iOS URL cache policy for a remote image request.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ImageCachePolicy =
  | "default"
  | "reload"
  | "force-cache"
  | "only-if-cached"

/**
 * Corner insets, in points, that stay unstretched when resizing an image on iOS.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ImageInsets {
  readonly top?: number | undefined
  readonly left?: number | undefined
  readonly bottom?: number | undefined
  readonly right?: number | undefined
}

/**
 * A URI image source with optional request settings and intrinsic size.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ImageURISource {
  readonly uri: string
  readonly headers?: Readonly<Record<string, string>> | undefined
  readonly method?: string | undefined
  readonly body?: string | undefined
  readonly cache?: ImageCachePolicy | undefined
  readonly width?: number | undefined
  readonly height?: number | undefined
  readonly scale?: number | undefined
  readonly bundle?: string | undefined
}

/**
 * A single image source: a Metro asset ID from a static `import`, a URI
 * string, or a structured {@link ImageURISource}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SingleImageSource = number | string | ImageURISource

/**
 * What `Image` accepts as `source`: one source, or an array of candidates for
 * native to choose from.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ImageSource = SingleImageSource | ReadonlyArray<SingleImageSource>

/**
 * Style properties of an `Image`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ImageStyle extends Native.ViewStyle {
  readonly resizeMode?: ImageResizeMode | undefined
  readonly tintColor?: Native.Color | undefined
  readonly overlayColor?: Native.Color | undefined
}

/**
 * Payload of an image's `load` event.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ImageLoadPayload {
  readonly source: {
    readonly uri: string
    readonly width: number
    readonly height: number
  }
}

/**
 * Payload of an image's `progress` event.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ImageProgressPayload {
  readonly progress: number
  readonly loaded: number
  readonly total: number
}

/**
 * Payload of an image's `error` event.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ImageErrorPayload {
  readonly error?: string | undefined
  readonly responseCode?: number | undefined
  readonly httpResponseHeaders?: Readonly<Record<string, string>> | undefined
}

/**
 * The events of an `Image`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ImageEvents extends Native.ViewEvents {
  readonly loadStart: {}
  readonly progress: ImageProgressPayload
  readonly load: ImageLoadPayload
  readonly error: ImageErrorPayload
  readonly loadEnd: {}
}

/**
 * Options accepted by {@link Image}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ImageOptions {
  readonly source: ImageSource
  readonly resizeMode?: ImageResizeMode | undefined
  readonly blurRadius?: number | undefined
  readonly capInsets?: ImageInsets | undefined
  readonly fadeDuration?: number | undefined
  readonly progressiveRenderingEnabled?: boolean | undefined
  readonly resizeMethod?: ImageResizeMethod | undefined
  readonly resizeMultiplier?: number | undefined
}

const normalizeSources = (
  value: unknown,
  os: string
): ReadonlyArray<ImageURISource> | undefined => {
  if (value === undefined) return undefined
  const out: Array<ImageURISource> = []
  for (
    const source of (Array.isArray(value) ? value : [value]) as ReadonlyArray<
      SingleImageSource
    >
  ) {
    const one = typeof source === "number"
      ? resolveAsset(source, os)
      : typeof source === "string"
      ? { uri: source }
      : source
    if (one !== undefined) out.push(one)
  }
  return out
}

// An inline source object is new every render, and a changed source reloads
// the image.
const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (
    typeof a !== "object" || typeof b !== "object" || a === null || b === null
  ) {
    return false
  }
  let count = 0
  for (const key in a) {
    if (!same((a as any)[key], (b as any)[key])) return false
    count++
  }
  for (const _ in b) count--
  return count === 0
}

/**
 * The element builder of {@link Image}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ImageElement<Msg, R = never> = Native.Element<
  Msg,
  R,
  ImageEvents,
  "image",
  ImageStyle
>

const image = Native.defineView(
  () =>
    new Native.Element<any, never, ImageEvents, "image", ImageStyle>("image")
      // Android sends the load events only to an image that asks for them.
      .forward((node) => {
        for (const name in node.handlers) {
          if (/^(load|progress|error)/.test(name)) {
            return node.prop("shouldNotifyLoadEvents", true)
          }
        }
        return node
      }),
  {
    viewName: "RCTImageView",
    // Fabric defaults resizeMode to stretch; React Native defaults to cover + hidden.
    defaults: { resizeMode: "cover", overflow: "hidden" },
    props: {
      source(n, value, host) {
        const sources = normalizeSources(value, host.os)
        if (same(n.props.source, sources)) return
        host.set(n, "source", sources)
        if (host.os === "android") {
          host.set(n, "headers", sources?.[0]?.headers)
        }
      }
    }
  }
)

const intrinsicSize = (
  source: ImageSource
): Pick<ImageURISource, "width" | "height"> | undefined => {
  const single = Array.isArray(source)
    ? (source.length === 1 ? source[0] : undefined)
    : source
  if (typeof single === "number") return getAssetByID(single)
  if (typeof single === "object" && single !== null) return single
  return undefined
}

/**
 * Renders an image over `RCTImageView`. A bundled asset's dimensions become
 * the default `width` and `height` style, which a chained `.style(...)`
 * overrides.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Image = <Msg>(
  _h: Native.H<Msg>,
  options: ImageOptions
): ImageElement<Msg> => {
  const size = intrinsicSize(options.source)
  // The options are named as the native props, which `style` sets.
  return (image as ImageElement<Msg>).style(
    { width: size?.width, height: size?.height, ...options } as ImageStyle
  )
}
