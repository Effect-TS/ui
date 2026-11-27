/**
 * React Native's CSS parsers, for style values written as CSS strings.
 *
 * **Details**
 *
 * `Native` styles take the structured forms native reads, so an app that
 * writes those ships no parser. These helpers turn a CSS string, or React
 * Native's object form with plain colours, into that form. Each one is
 * bundled only when used.
 *
 * @example
 * ```ts
 * import { Css } from "@effect/ui-native/kit"
 * import type { Native } from "@effect/ui-native"
 *
 * const card: Native.ViewStyle = {
 *   transform: Css.transform("rotate(45deg) scale(1.5)"),
 *   boxShadow: Css.boxShadow("0 2px 8px rgba(0, 0, 0, 0.25)"),
 *   backgroundImage: Css.backgroundImage("linear-gradient(#f00, #00f)")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Native from "../Native.ts"
// One module per parser, so an unused helper leaves no import of React
// Native behind in the pre-bundle.
import processBackgroundImage from "./internal/processBackgroundImage.ts"
import processBackgroundPosition from "./internal/processBackgroundPosition.ts"
import processBackgroundRepeat from "./internal/processBackgroundRepeat.ts"
import processBackgroundSize from "./internal/processBackgroundSize.ts"
import processBoxShadow from "./internal/processBoxShadow.ts"
import processColor from "./internal/processColor.ts"
import processFilter from "./internal/processFilter.ts"
import processTransform from "./internal/processTransform.ts"
import processTransformOrigin from "./internal/processTransformOrigin.ts"

/**
 * A length as CSS writes it, such as `"4px"`, or a number of
 * density-independent pixels.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CssLength = number | string

/**
 * A shadow in React Native's object form for {@link boxShadow}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface BoxShadowInput {
  readonly offsetX: CssLength
  readonly offsetY: CssLength
  readonly blurRadius?: CssLength | undefined
  readonly spreadDistance?: CssLength | undefined
  readonly inset?: boolean | undefined
  readonly color?: Native.Color | undefined
}

/**
 * A filter function in React Native's object form for {@link filter}.
 * Amounts may be numbers or CSS strings such as `"50%"` or `"90deg"`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type FilterInput =
  | { readonly blur: CssLength }
  | { readonly brightness: CssLength }
  | { readonly contrast: CssLength }
  | { readonly grayscale: CssLength }
  | { readonly hueRotate: CssLength }
  | { readonly invert: CssLength }
  | { readonly opacity: CssLength }
  | { readonly saturate: CssLength }
  | { readonly sepia: CssLength }
  | {
    readonly dropShadow: string | {
      readonly offsetX: CssLength
      readonly offsetY: CssLength
      readonly standardDeviation?: CssLength | undefined
      readonly color?: Native.Color | undefined
    }
  }

/**
 * A gradient in React Native's object form for {@link backgroundImage}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type GradientInput =
  | {
    readonly type: "linear-gradient"
    /** An angle such as `"45deg"`, or a direction such as `"to right"`. */
    readonly direction?: string | undefined
    readonly colorStops: ReadonlyArray<ColorStopInput>
  }
  | {
    readonly type: "radial-gradient"
    readonly shape: "circle" | "ellipse"
    readonly size:
      | "closest-corner"
      | "closest-side"
      | "farthest-corner"
      | "farthest-side"
      | { readonly x: CssLength; readonly y: CssLength }
    readonly position: Native.Position
    readonly colorStops: ReadonlyArray<ColorStopInput>
  }

/**
 * A colour stop of a {@link GradientInput}, with up to two positions such as
 * `"20%"`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ColorStopInput {
  readonly color: Native.Color
  readonly positions?: ReadonlyArray<string> | undefined
}

/**
 * Converts a colour for a field that takes a `Native.ProcessedColor`, such
 * as the `color` of a `Native.BoxShadow`. The colour must be valid.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const color: (color: Native.Color) => Native.ProcessedColor =
  processColor

/**
 * Parses a CSS `transform`, such as `"translateX(10px) rotate(45deg)"`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const transform: (
  transform: string
) => ReadonlyArray<Native.TransformOperation> = processTransform

/**
 * Parses a CSS `transform-origin`, such as `"top left"`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const transformOrigin: (
  origin: string
) => readonly [Native.Length, Native.Length, number] = processTransformOrigin

/**
 * Parses a CSS `box-shadow`, or converts React Native's object form.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const boxShadow: (
  shadow: string | ReadonlyArray<BoxShadowInput>
) => ReadonlyArray<Native.BoxShadow> = processBoxShadow

/**
 * Parses a CSS `filter`, such as `"blur(4px) drop-shadow(0 2px 4px #000)"`,
 * or converts React Native's object form.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const filter: (
  filter: string | ReadonlyArray<FilterInput>
) => ReadonlyArray<Native.Filter> = processFilter

/**
 * Parses CSS `linear-gradient(...)` and `radial-gradient(...)` images, or
 * converts React Native's object form.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const backgroundImage: (
  image: string | ReadonlyArray<GradientInput>
) => ReadonlyArray<Native.Gradient> = processBackgroundImage

/**
 * Parses a CSS `background-size`, such as `"50% auto"`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const backgroundSize: (
  size: string
) => NonNullable<Native.ViewStyle["backgroundSize"]> = processBackgroundSize

/**
 * Parses a CSS `background-position`, such as `"center top"`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const backgroundPosition: (
  position: string
) => ReadonlyArray<Native.Position> = processBackgroundPosition

/**
 * Parses a CSS `background-repeat`, such as `"repeat-x"`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const backgroundRepeat: (
  repeat: string
) => NonNullable<Native.ViewStyle["backgroundRepeat"]> = processBackgroundRepeat
