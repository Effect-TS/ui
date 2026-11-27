/**
 * Colours native resolves when it draws: the system's named colours, and
 * iOS colours that follow the colour scheme.
 *
 * **Details**
 *
 * `make` names a colour on each platform, such as iOS's `"label"` and
 * Android's `"?android:attr/textColor"`, so one colour works on both. With
 * several names a platform takes the first it has. `dynamic` is an iOS
 * colour for each colour scheme, and a plain colour on Android.
 *
 * A platform without a name it has shows `fallback`, or nothing without
 * one. Both make a `Native.Color`, which a style's colour props take.
 *
 * **Example** (Text in the system's label colour)
 *
 * ```ts
 * import * as Native from "@effect/ui-native/Native"
 * import { PlatformColor } from "@effect/ui-native/kit"
 * import { Schema } from "effect"
 *
 * const label = PlatformColor.make({
 *   ios: "label",
 *   android: "?android:attr/textColorPrimary",
 *   fallback: "black"
 * })
 *
 * const Title = Native.component({
 *   name: "Title",
 *   model: Schema.Struct({}),
 *   message: Schema.Never
 * }).make({
 *   init: () => ({}),
 *   update: ($) => $.model,
 *   view: (h) => h.text.style({ color: label }).children("Settings")
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Native from "../Native.ts"

const names = (name: string | ReadonlyArray<string> | undefined) =>
  name === undefined ? [] : typeof name === "string" ? [name] : name

/**
 * The names of a colour on each platform, and the colour to show where none
 * resolves.
 *
 * **Details**
 *
 * - `ios`: `UIColor` names, such as `"systemBlue"` or `"label"`.
 * - `android`: resource paths, such as `"@android:color/holo_blue_light"`
 *   or `"?attr/colorPrimary"`.
 * - `fallback`: a colour string, such as `"#007aff"`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Names {
  readonly ios?: string | ReadonlyArray<string> | undefined
  readonly android?: string | ReadonlyArray<string> | undefined
  readonly fallback?: string | undefined
}

const withFallback = (color: object, fallback: string | undefined) =>
  (fallback === undefined
    ? color
    : { ...color, fallback }) as Native.NativeColor

/**
 * A system colour, named on each platform.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = (colour: Names): Native.NativeColor =>
  // Both platforms' keys go in one object: React Native passes an object
  // with `semantic` on iOS and with `resource_paths` on Android, and each
  // parser reads its own key, and `fallback` when it names nothing.
  withFallback({
    semantic: names(colour.ios),
    resource_paths: names(colour.android)
  }, colour.fallback)

/**
 * The colours of `dynamic` for each of iOS's colour schemes, and the one
 * Android shows.
 *
 * **Details**
 *
 * `highContrastLight` and `highContrastDark` show when the user asks for
 * more contrast, and default to `light` and `dark`. `android` defaults to
 * `light` when it's a colour string or number, and is required when it's
 * a `Native.NativeColor`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Dynamic =
  | Schemes<string | number> & { readonly android?: string | undefined }
  | Schemes<Native.Color> & { readonly android: string }

/**
 * The colours of `dynamic` for each of iOS's colour schemes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Schemes<Light extends Native.Color = Native.Color> {
  readonly light: Light
  readonly dark: Native.Color
  readonly highContrastLight?: Native.Color | undefined
  readonly highContrastDark?: Native.Color | undefined
}

// Android's fallback is a colour string, and a number is React Native's
// 0xRRGGBBAA.
const css = (color: Native.Color): string | undefined =>
  typeof color === "string"
    ? color
    : typeof color === "number"
    ? `#${(color >>> 0).toString(16).padStart(8, "0")}`
    : undefined

/**
 * An iOS colour that follows the colour scheme, as React Native's
 * `DynamicColorIOS`, and `android` on Android.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const dynamic = (colors: Dynamic): Native.NativeColor => {
  const { android, ...schemes } = colors
  // iOS reads `dynamic`, and Android, which drops a colour object without
  // `resource_paths`, finds none and shows `fallback`.
  return withFallback(
    { dynamic: schemes, resource_paths: [] },
    android ?? css(colors.light)
  )
}
