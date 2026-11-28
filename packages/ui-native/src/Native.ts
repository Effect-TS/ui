/**
 * The React Native element vocabulary: `view`, `text`, `scroll` and
 * `input`, rendered by `NativeHost` as Fabric's native views.
 *
 * Other modules add native views with {@link defineView}, so an app's host
 * holds only the views it renders.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Renderer from "@effect/ui/Renderer"
import * as View from "@effect/ui/View"
import * as Context from "effect/Context"
import { kinds } from "./internal/kinds.ts"
import type { NativeNode, UIManager } from "./NativeHost.ts"

/**
 * A colour as React Native parses it: a CSS colour string or a number.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Color = string | number

/**
 * A colour already converted for Fabric, as `Css.color` from
 * `@effect/ui-native/kit` returns it.
 *
 * **Details**
 *
 * The host converts props whose names end in `Color`, but not colours nested
 * inside a value such as `boxShadow`, which native ignores or rejects when
 * they are strings. Those fields take this type, and a `ProcessedColor`
 * isn't a {@link Color}, since converting it again changes it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ProcessedColor {
  readonly "~ProcessedColor": never
}

/**
 * A length in density-independent pixels or a percentage.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Length = number | `${number}%`

/**
 * A {@link Length}, or `"auto"`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Dimension = Length | "auto"

/**
 * An angle in radians, or a string in degrees or radians.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Angle = number | `${number}deg` | `${number}rad`

/**
 * One operation of a `transform`. A `matrix` holds 9 or 16 numbers and must
 * be the only operation.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type TransformOperation =
  | { readonly perspective: number }
  | { readonly rotate: Angle }
  | { readonly rotateX: Angle }
  | { readonly rotateY: Angle }
  | { readonly rotateZ: Angle }
  | { readonly scale: number }
  | { readonly scaleX: number }
  | { readonly scaleY: number }
  | { readonly translate: readonly [Length, Length] }
  | { readonly translateX: Length }
  | { readonly translateY: Length }
  | { readonly skewX: Angle }
  | { readonly skewY: Angle }
  | { readonly matrix: ReadonlyArray<number> }

/**
 * A shadow of `boxShadow`, in density-independent pixels.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface BoxShadow {
  readonly offsetX: number
  readonly offsetY: number
  readonly blurRadius?: number | undefined
  readonly spreadDistance?: number | undefined
  readonly inset?: boolean | undefined
  readonly color?: ProcessedColor | undefined
}

/**
 * The shadow of a `dropShadow` filter, in density-independent pixels.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface DropShadow {
  readonly offsetX: number
  readonly offsetY: number
  readonly standardDeviation?: number | undefined
  readonly color?: ProcessedColor | undefined
}

/**
 * One function of a `filter`. `blur` is in density-independent pixels,
 * `hueRotate` in degrees, and the rest are fractions, `1` for 100%.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Filter =
  | { readonly blur: number }
  | { readonly brightness: number }
  | { readonly contrast: number }
  | { readonly grayscale: number }
  | { readonly hueRotate: number }
  | { readonly invert: number }
  | { readonly opacity: number }
  | { readonly saturate: number }
  | { readonly sepia: number }
  | { readonly dropShadow: DropShadow }

/**
 * A point of a gradient, or of a background image's placement, measured
 * from two edges of the view.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Position =
  | { readonly top: Length; readonly left: Length }
  | { readonly top: Length; readonly right: Length }
  | { readonly bottom: Length; readonly left: Length }
  | { readonly bottom: Length; readonly right: Length }

/**
 * A colour stop of a gradient. A `null` colour is a transition hint.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ColorStop {
  readonly color: ProcessedColor | null
  readonly position: Length | null
}

/**
 * A gradient of `backgroundImage`, in the form native reads. A linear
 * gradient's angle is in degrees, and a keyword direction is a string such as
 * `"to bottom right"`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Gradient =
  | {
    readonly type: "linear-gradient"
    readonly direction:
      | { readonly type: "angle"; readonly value: number }
      | { readonly type: "keyword"; readonly value: string }
    readonly colorStops: ReadonlyArray<ColorStop>
  }
  | {
    readonly type: "radial-gradient"
    readonly shape: "circle" | "ellipse"
    readonly size:
      | "closest-corner"
      | "closest-side"
      | "farthest-corner"
      | "farthest-side"
      | { readonly x: Length; readonly y: Length }
    readonly position: Position
    readonly colorStops: ReadonlyArray<ColorStop>
  }

/**
 * How a background image repeats along an axis.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type BackgroundRepeat = "repeat" | "space" | "round" | "no-repeat"

/**
 * A width and a height, in density-independent pixels.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Size {
  readonly width: number
  readonly height: number
}

/**
 * Distances from each edge, in density-independent pixels.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Insets {
  readonly top?: number | undefined
  readonly left?: number | undefined
  readonly bottom?: number | undefined
  readonly right?: number | undefined
}

/**
 * Layout properties, which Yoga applies as CSS flexbox with
 * `flexDirection: "column"` by default. `start` and `end` follow the layout
 * direction, and the `Block` and `Inline` names are the vertical and
 * horizontal edges.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface LayoutStyle {
  readonly display?: "flex" | "none" | "contents" | undefined
  readonly position?: "relative" | "absolute" | "static" | undefined
  readonly direction?: "inherit" | "ltr" | "rtl" | undefined
  readonly boxSizing?: "border-box" | "content-box" | undefined
  readonly flex?: number | undefined
  readonly flexBasis?: Dimension | undefined
  readonly flexDirection?:
    | "row"
    | "column"
    | "row-reverse"
    | "column-reverse"
    | undefined
  readonly flexGrow?: number | undefined
  readonly flexShrink?: number | undefined
  readonly flexWrap?: "wrap" | "nowrap" | "wrap-reverse" | undefined
  readonly justifyContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly"
    | undefined
  readonly alignItems?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "stretch"
    | "baseline"
    | undefined
  readonly alignSelf?:
    | "auto"
    | "flex-start"
    | "flex-end"
    | "center"
    | "stretch"
    | "baseline"
    | undefined
  readonly alignContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "stretch"
    | "space-between"
    | "space-around"
    | "space-evenly"
    | undefined
  readonly gap?: number | undefined
  readonly rowGap?: number | undefined
  readonly columnGap?: number | undefined
  readonly width?: Dimension | undefined
  readonly height?: Dimension | undefined
  readonly minWidth?: Dimension | undefined
  readonly minHeight?: Dimension | undefined
  readonly maxWidth?: Dimension | undefined
  readonly maxHeight?: Dimension | undefined
  readonly aspectRatio?: number | undefined
  readonly top?: Dimension | undefined
  readonly right?: Dimension | undefined
  readonly bottom?: Dimension | undefined
  readonly left?: Dimension | undefined
  readonly start?: Dimension | undefined
  readonly end?: Dimension | undefined
  readonly inset?: Dimension | undefined
  readonly insetBlock?: Dimension | undefined
  readonly insetBlockStart?: Dimension | undefined
  readonly insetBlockEnd?: Dimension | undefined
  readonly insetInline?: Dimension | undefined
  readonly insetInlineStart?: Dimension | undefined
  readonly insetInlineEnd?: Dimension | undefined
  readonly margin?: Dimension | undefined
  readonly marginHorizontal?: Dimension | undefined
  readonly marginVertical?: Dimension | undefined
  readonly marginTop?: Dimension | undefined
  readonly marginRight?: Dimension | undefined
  readonly marginBottom?: Dimension | undefined
  readonly marginLeft?: Dimension | undefined
  readonly marginStart?: Dimension | undefined
  readonly marginEnd?: Dimension | undefined
  readonly marginBlock?: Dimension | undefined
  readonly marginBlockStart?: Dimension | undefined
  readonly marginBlockEnd?: Dimension | undefined
  readonly marginInline?: Dimension | undefined
  readonly marginInlineStart?: Dimension | undefined
  readonly marginInlineEnd?: Dimension | undefined
  readonly padding?: Dimension | undefined
  readonly paddingHorizontal?: Dimension | undefined
  readonly paddingVertical?: Dimension | undefined
  readonly paddingTop?: Dimension | undefined
  readonly paddingRight?: Dimension | undefined
  readonly paddingBottom?: Dimension | undefined
  readonly paddingLeft?: Dimension | undefined
  readonly paddingStart?: Dimension | undefined
  readonly paddingEnd?: Dimension | undefined
  readonly paddingBlock?: Dimension | undefined
  readonly paddingBlockStart?: Dimension | undefined
  readonly paddingBlockEnd?: Dimension | undefined
  readonly paddingInline?: Dimension | undefined
  readonly paddingInlineStart?: Dimension | undefined
  readonly paddingInlineEnd?: Dimension | undefined
  readonly overflow?: "visible" | "hidden" | "scroll" | undefined
  readonly zIndex?: number | undefined
}

/**
 * Style properties of a `view`, a `scroll` and an `input`.
 *
 * **Details**
 *
 * Values take the structured forms native reads, not CSS strings: build
 * those from strings with `Css` from `@effect/ui-native/kit`. The
 * `shadow*` properties draw on iOS, and `elevation` on Android.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ViewStyle extends LayoutStyle {
  readonly backgroundColor?: Color | undefined
  readonly opacity?: number | undefined
  readonly backfaceVisibility?: "visible" | "hidden" | undefined
  readonly borderWidth?: number | undefined
  readonly borderTopWidth?: number | undefined
  readonly borderRightWidth?: number | undefined
  readonly borderBottomWidth?: number | undefined
  readonly borderLeftWidth?: number | undefined
  readonly borderStartWidth?: number | undefined
  readonly borderEndWidth?: number | undefined
  readonly borderColor?: Color | undefined
  readonly borderTopColor?: Color | undefined
  readonly borderRightColor?: Color | undefined
  readonly borderBottomColor?: Color | undefined
  readonly borderLeftColor?: Color | undefined
  readonly borderStartColor?: Color | undefined
  readonly borderEndColor?: Color | undefined
  readonly borderBlockColor?: Color | undefined
  readonly borderBlockStartColor?: Color | undefined
  readonly borderBlockEndColor?: Color | undefined
  readonly borderRadius?: number | undefined
  readonly borderTopLeftRadius?: number | undefined
  readonly borderTopRightRadius?: number | undefined
  readonly borderBottomLeftRadius?: number | undefined
  readonly borderBottomRightRadius?: number | undefined
  readonly borderTopStartRadius?: number | undefined
  readonly borderTopEndRadius?: number | undefined
  readonly borderBottomStartRadius?: number | undefined
  readonly borderBottomEndRadius?: number | undefined
  readonly borderStartStartRadius?: number | undefined
  readonly borderStartEndRadius?: number | undefined
  readonly borderEndStartRadius?: number | undefined
  readonly borderEndEndRadius?: number | undefined
  readonly borderCurve?: "circular" | "continuous" | undefined
  readonly borderStyle?: "solid" | "dotted" | "dashed" | undefined
  readonly outlineColor?: Color | undefined
  readonly outlineOffset?: number | undefined
  readonly outlineStyle?: "solid" | "dotted" | "dashed" | undefined
  readonly outlineWidth?: number | undefined
  readonly shadowColor?: Color | undefined
  readonly shadowOffset?: Size | undefined
  readonly shadowOpacity?: number | undefined
  readonly shadowRadius?: number | undefined
  readonly elevation?: number | undefined
  readonly boxShadow?: ReadonlyArray<BoxShadow> | undefined
  readonly filter?: ReadonlyArray<Filter> | undefined
  readonly transform?: ReadonlyArray<TransformOperation> | undefined
  /** The x, y and z of the point transforms are applied around. */
  readonly transformOrigin?: readonly [Length, Length, number] | undefined
  readonly backgroundImage?: ReadonlyArray<Gradient> | undefined
  readonly backgroundSize?:
    | ReadonlyArray<{ readonly x: Dimension; readonly y: Dimension }>
    | undefined
  readonly backgroundPosition?: ReadonlyArray<Position> | undefined
  readonly backgroundRepeat?:
    | ReadonlyArray<{
      readonly x: BackgroundRepeat
      readonly y: BackgroundRepeat
    }>
    | undefined
  readonly mixBlendMode?:
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "darken"
    | "lighten"
    | "color-dodge"
    | "color-burn"
    | "hard-light"
    | "soft-light"
    | "difference"
    | "exclusion"
    | "hue"
    | "saturation"
    | "color"
    | "luminosity"
    | "plus-lighter"
    | undefined
  readonly isolation?: "auto" | "isolate" | undefined
  readonly cursor?: "auto" | "pointer" | undefined
  readonly pointerEvents?: "auto" | "none" | "box-none" | "box-only" | undefined
}

/**
 * A typographic feature of `fontVariant`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type FontVariant =
  | "small-caps"
  | "oldstyle-nums"
  | "lining-nums"
  | "tabular-nums"
  | "proportional-nums"
  | "common-ligatures"
  | "no-common-ligatures"
  | "discretionary-ligatures"
  | "no-discretionary-ligatures"
  | "historical-ligatures"
  | "no-historical-ligatures"
  | "contextual"
  | "no-contextual"
  | `stylistic-${
    | "one"
    | "two"
    | "three"
    | "four"
    | "five"
    | "six"
    | "seven"
    | "eight"
    | "nine"
    | "ten"
    | "eleven"
    | "twelve"
    | "thirteen"
    | "fourteen"
    | "fifteen"
    | "sixteen"
    | "seventeen"
    | "eighteen"
    | "nineteen"
    | "twenty"}`

/**
 * Style properties of `text` and `input`. Nested `text` inherits them.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TextStyle extends ViewStyle {
  readonly color?: Color | undefined
  readonly fontFamily?: string | undefined
  readonly fontSize?: number | undefined
  readonly fontStyle?: "normal" | "italic" | undefined
  readonly fontWeight?:
    | "normal"
    | "bold"
    | "100"
    | "200"
    | "300"
    | "400"
    | "500"
    | "600"
    | "700"
    | "800"
    | "900"
    | undefined
  readonly fontVariant?: ReadonlyArray<FontVariant> | undefined
  /** OpenType axis values in CSS syntax, such as `'"wght" 650'`. */
  readonly fontVariationSettings?: string | undefined
  readonly letterSpacing?: number | undefined
  readonly lineHeight?: number | undefined
  readonly textAlign?:
    | "auto"
    | "left"
    | "right"
    | "center"
    | "justify"
    | "start"
    | "end"
    | undefined
  /** Android only. */
  readonly textAlignVertical?: "auto" | "top" | "bottom" | "center" | undefined
  /** Android only. */
  readonly includeFontPadding?: boolean | undefined
  readonly writingDirection?: "auto" | "ltr" | "rtl" | undefined
  readonly textDecorationLine?:
    | "none"
    | "underline"
    | "line-through"
    | "underline line-through"
    | undefined
  readonly textDecorationStyle?:
    | "solid"
    | "double"
    | "dotted"
    | "dashed"
    | undefined
  readonly textDecorationColor?: Color | undefined
  readonly textShadowColor?: Color | undefined
  readonly textShadowOffset?: Size | undefined
  readonly textShadowRadius?: number | undefined
  readonly textTransform?:
    | "none"
    | "capitalize"
    | "uppercase"
    | "lowercase"
    | undefined
}

/**
 * An accessibility role, which Fabric reads from the `role` prop.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Role =
  | "alert"
  | "alertdialog"
  | "application"
  | "article"
  | "banner"
  | "button"
  | "cell"
  | "checkbox"
  | "columnheader"
  | "combobox"
  | "complementary"
  | "contentinfo"
  | "definition"
  | "dialog"
  | "directory"
  | "document"
  | "feed"
  | "figure"
  | "form"
  | "grid"
  | "group"
  | "heading"
  | "img"
  | "link"
  | "list"
  | "listitem"
  | "log"
  | "main"
  | "marquee"
  | "math"
  | "menu"
  | "menubar"
  | "menuitem"
  | "meter"
  | "navigation"
  | "none"
  | "note"
  | "option"
  | "presentation"
  | "progressbar"
  | "radio"
  | "radiogroup"
  | "region"
  | "row"
  | "rowgroup"
  | "rowheader"
  | "scrollbar"
  | "searchbox"
  | "separator"
  | "slider"
  | "spinbutton"
  | "status"
  | "summary"
  | "switch"
  | "tab"
  | "table"
  | "tablist"
  | "tabpanel"
  | "term"
  | "timer"
  | "toolbar"
  | "tooltip"
  | "tree"
  | "treegrid"
  | "treeitem"

/**
 * Props of a `view`, a `scroll` and every other native element, set with
 * `.prop(name, value)`.
 *
 * **Details**
 *
 * These are React Native's native prop names. The `aria-*` and `id`
 * aliases of React Native's `View` aren't mapped: use `accessibilityState`,
 * `accessibilityValue`, `accessibilityLabel` and `nativeID`. Bind
 * `accessibilityAction` to receive the `accessibilityActions` a user runs.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ViewProps {
  readonly testID?: string | undefined
  readonly nativeID?: string | undefined
  /** Groups the view and its children into one element for assistive technology. */
  readonly accessible?: boolean | undefined
  /** Android only: whether the view takes keyboard focus. */
  readonly focusable?: boolean | undefined
  readonly role?: Role | undefined
  readonly accessibilityLabel?: string | undefined
  readonly accessibilityHint?: string | undefined
  readonly accessibilityLanguage?: string | undefined
  readonly accessibilityState?:
    | {
      readonly disabled?: boolean | undefined
      readonly selected?: boolean | undefined
      readonly checked?: boolean | "mixed" | undefined
      readonly busy?: boolean | undefined
      readonly expanded?: boolean | undefined
    }
    | undefined
  readonly accessibilityValue?:
    | {
      readonly min?: number | undefined
      readonly max?: number | undefined
      readonly now?: number | undefined
      readonly text?: string | undefined
    }
    | undefined
  readonly accessibilityActions?:
    | ReadonlyArray<{
      readonly name: string
      readonly label?: string | undefined
    }>
    | undefined
  /** Android only. */
  readonly accessibilityLiveRegion?: "none" | "polite" | "assertive" | undefined
  /** Android only. */
  readonly accessibilityLabelledBy?: string | ReadonlyArray<string> | undefined
  /** Android only. */
  readonly importantForAccessibility?:
    | "auto"
    | "yes"
    | "no"
    | "no-hide-descendants"
    | undefined
  /** iOS only. */
  readonly accessibilityElementsHidden?: boolean | undefined
  /** iOS only. */
  readonly accessibilityViewIsModal?: boolean | undefined
  /** iOS only. */
  readonly accessibilityIgnoresInvertColors?: boolean | undefined
  /** How far outside the view a touch may start and still reach it. */
  readonly hitSlop?: Insets | undefined
  /** `false` keeps a view Fabric would otherwise flatten away. */
  readonly collapsable?: boolean | undefined
  readonly removeClippedSubviews?: boolean | undefined
  /** Android only. */
  readonly renderToHardwareTextureAndroid?: boolean | undefined
  /** Android only. */
  readonly needsOffscreenAlphaCompositing?: boolean | undefined
  /** iOS only. */
  readonly shouldRasterizeIOS?: boolean | undefined
}

/**
 * Props of `text`, set with `.prop(name, value)`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TextProps extends ViewProps {
  /** Truncates the text to this many lines. */
  readonly numberOfLines?: number | undefined
  /** Where truncated text shows its ellipsis. `"tail"` by default. */
  readonly ellipsizeMode?: "head" | "middle" | "tail" | "clip" | undefined
  readonly selectable?: boolean | undefined
  readonly allowFontScaling?: boolean | undefined
  readonly maxFontSizeMultiplier?: number | undefined
  /** Shrinks the font to fit the text in its box. */
  readonly adjustsFontSizeToFit?: boolean | undefined
  /** iOS only: the smallest scale `adjustsFontSizeToFit` shrinks to. */
  readonly minimumFontScale?: number | undefined
  /** Android only: the highlight of selected text. */
  readonly selectionColor?: Color | undefined
}

/**
 * Props of an `input`, set with `.prop(name, value)`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface InputProps extends ViewProps {
  readonly value?: string | undefined
  /** Initial text for an uncontrolled input; changing it replaces the text. */
  readonly defaultValue?: string | undefined
  readonly placeholder?: string | undefined
  readonly placeholderTextColor?: Color | undefined
  readonly selectionColor?: Color | undefined
  readonly allowFontScaling?: boolean | undefined
  readonly maxFontSizeMultiplier?: number | undefined
  /**
   * Allows multiple lines of text. Unlike React Native's `TextInput`, no
   * `paddingTop: 5` is added on iOS.
   */
  readonly multiline?: boolean | undefined
  readonly secureTextEntry?: boolean | undefined
  readonly keyboardType?:
    | "default"
    | "number-pad"
    | "decimal-pad"
    | "numeric"
    | "email-address"
    | "phone-pad"
    | "url"
    | "ascii-capable"
    | "ascii-capable-number-pad"
    | "numbers-and-punctuation"
    | "name-phone-pad"
    | "twitter"
    | "web-search"
    | "visible-password"
    | undefined
  readonly returnKeyType?:
    | "done"
    | "go"
    | "next"
    | "search"
    | "send"
    | "none"
    | "previous"
    | "default"
    | "emergency-call"
    | "google"
    | "join"
    | "route"
    | "yahoo"
    | "continue"
    | undefined
  /** `"sentences"` by default, matching React Native on both platforms. */
  readonly autoCapitalize?:
    | "none"
    | "sentences"
    | "words"
    | "characters"
    | undefined
  readonly editable?: boolean | undefined
  readonly maxLength?: number | undefined
  readonly submitBehavior?: "submit" | "blurAndSubmit" | "newline" | undefined
  readonly autoCorrect?: boolean | undefined
  readonly autoFocus?: boolean | undefined
  readonly selectTextOnFocus?: boolean | undefined
  /** Android only. Transparent (`0`) by default, hiding the Material underline. */
  readonly underlineColorAndroid?: Color | undefined
}

/**
 * Where a press ended, in points from the top left of the screen.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface PressPayload {
  readonly x: number
  readonly y: number
}

/**
 * A scroll view's offset and sizes, in points.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ScrollPayload {
  readonly x: number
  readonly y: number
  readonly contentWidth: number
  readonly contentHeight: number
  readonly width: number
  readonly height: number
}

/**
 * A width and a height, in points.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface SizePayload {
  readonly width: number
  readonly height: number
}

/**
 * The text of an `input`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ValuePayload {
  readonly value: string
}

/**
 * An element's position and size in its parent, in points.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface LayoutPayload {
  readonly layout: Rect
}

/**
 * The name of the `accessibilityActions` entry a user ran.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface AccessibilityActionPayload {
  readonly actionName: string
}

/**
 * Metrics of one laid-out line of `text`, in points.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface TextLine {
  readonly text: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly ascender: number
  readonly descender: number
  readonly capHeight: number
  readonly xHeight: number
}

/**
 * The laid-out lines of an outer `text` element.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface TextLayoutPayload {
  readonly lines: ReadonlyArray<TextLine>
}

/**
 * A text selection range in an `input`, as UTF-16 code unit offsets.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface Selection {
  readonly start: number
  readonly end: number
}

/**
 * The selection reported by an `input`'s `selectionChange` event.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface SelectionChangePayload {
  readonly selection: Selection
}

/**
 * The key reported by an `input`'s `keyPress` event (`"Backspace"`,
 * `"Enter"`, typed characters, and on iOS also `"Tab"` and `"Escape"`).
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface KeyPressPayload {
  readonly key: string
}

/**
 * The content size reported by an `input`'s `contentSizeChange` event, in points.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ContentSizeChangePayload {
  readonly contentSize: SizePayload
}

/**
 * The events of a `view`. A press ends on the element, or at most 20 points
 * outside it. `layout` fires when layout changes the element's position or
 * size. `animationEnd` fires when every transition `Animation.style` started
 * on the element has reached its target.
 *
 * `accessibilityTap` (iOS) fires when VoiceOver activates an `accessible`
 * element, and `accessibilityEscape` (iOS) on VoiceOver's escape gesture.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ViewEvents {
  readonly press: PressPayload
  readonly layout: LayoutPayload
  readonly animationEnd: {}
  readonly accessibilityAction: AccessibilityActionPayload
  readonly accessibilityTap: {}
  readonly accessibilityEscape: {}
}

/**
 * The events of a `text`. `textLayout` fires only on outer `text`; nested
 * `text` is virtual and never lays out on its own.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface TextEvents extends ViewEvents {
  readonly textLayout: TextLayoutPayload
}

/**
 * The events of a `scroll`.
 *
 * **Details**
 *
 * Native sends `scroll` once per frame on iOS and on every scroll change on
 * Android, unless `scrollEventThrottle` is set. A drag fires
 * `scrollBeginDrag` and `scrollEndDrag`. If the content keeps moving after
 * the drag, `momentumScrollBegin` and `momentumScrollEnd` follow.
 * `contentSizeChange` fires when layout changes the size of the content.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ScrollEvents extends ViewEvents {
  readonly scroll: ScrollPayload
  readonly scrollBeginDrag: ScrollPayload
  readonly scrollEndDrag: ScrollPayload
  readonly momentumScrollBegin: ScrollPayload
  readonly momentumScrollEnd: ScrollPayload
  readonly contentSizeChange: SizePayload
}

/**
 * The events of an `input`. `input` fires on every edit, `submit` when the
 * return key is pressed, and `endEditing` when editing finishes (before
 * `blur` on iOS, after `blur` on Android).
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface InputEvents {
  readonly input: ValuePayload
  readonly submit: ValuePayload
  readonly endEditing: ValuePayload
  readonly focus: {}
  readonly blur: {}
  readonly selectionChange: SelectionChangePayload
  readonly keyPress: KeyPressPayload
  readonly contentSizeChange: ContentSizeChangePayload
  readonly layout: LayoutPayload
}

/**
 * A host node's position and size on screen, in points.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * The native host marker, and the imperative operations a Command can run on
 * a node it holds a ref to. Provided by `NativeApp`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export class Host extends Context.Service<Host, {
  /** Focuses an `input`, which shows the keyboard. */
  readonly focus: (node: NativeNode) => void
  readonly blur: (node: NativeNode) => void
  readonly scrollTo: (
    node: NativeNode,
    x: number,
    y: number,
    animated?: boolean | undefined
  ) => void
  /** Scrolls a `scroll` to the end of its content. */
  readonly scrollToEnd: (
    node: NativeNode,
    animated?: boolean | undefined
  ) => void
  /** `undefined` until the node has been committed. */
  readonly measure: (node: NativeNode) => Rect | undefined
  /** Runs a native command, such as `flashScrollIndicators`. Does nothing before the node's first commit. */
  readonly command: (
    node: NativeNode,
    name: string,
    args?: ReadonlyArray<unknown> | undefined
  ) => void
}>()("@effect/ui-native/Native/Host") {}

declare module "@effect/ui/Command" {
  interface FrameworkServices {
    readonly NativeHost: Host
  }
}

/**
 * Clears an uncontrolled `input` using the host's latest event count and
 * updates the host's mirrored text. For a controlled input, clear the
 * `value` in your Model instead.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const clear = (
  host: Context.Service.Shape<typeof Host>,
  node: NativeNode
): void => {
  node.props.text = ""
  host.command(node, "setTextAndSelection", [node.eventCount, "", 0, 0])
}

/**
 * Moves the caret or selection of an `input` using the host's latest event
 * count. Omitting `end` collapses the caret at `start`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const setSelection = (
  host: Context.Service.Shape<typeof Host>,
  node: NativeNode,
  start: number,
  end = start
): void => {
  host.command(node, "setTextAndSelection", [
    node.eventCount,
    null,
    start,
    end
  ])
}

/**
 * Operations available to a {@link ViewKind}'s hooks.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ViewHost {
  /** `Platform.OS` of the running app. */
  readonly os: string
  /** Fabric's UIManager, for calls the host doesn't wrap. */
  readonly ui: UIManager
  /** Sets a Fabric prop for the next commit, processing `*Color` values. */
  readonly set: (node: NativeNode, name: string, value: unknown) => void
  /** Converts a colour for Fabric, for colours nested inside a prop. */
  readonly color: (value: unknown) => unknown
  /** Dispatches a native command; no-op before the node's first commit. */
  readonly command: (
    node: NativeNode,
    name: string,
    args?: ReadonlyArray<unknown> | undefined
  ) => void
  /** Dispatches `event` to the node's own handler, if bound. */
  readonly fire: (node: NativeNode, event: string, payload: unknown) => void
  /** Commits the surface's changes now, outside a render. */
  readonly commit: () => void
  /**
   * Gives the node a new native view, with a new tag, at the next commit.
   * Its descendants get new views too, and native state such as a scroll
   * offset is lost.
   */
  readonly recreate: (node: NativeNode) => void
}

/**
 * How the host renders an element: its Fabric view name, defaults, prop
 * setters, and native event hooks.
 *
 * **Details**
 *
 * Props without a setter go straight to Fabric. Native events without a hook
 * (such as `topLayout`) dispatch directly to the matching handler (`layout`)
 * without bubbling. Binding that handler sets the prop `onLayout` to `true`,
 * and unbinding it removes it, through the kind's setter if it has one.
 *
 * `value` is controlled: an `events` hook records what native currently shows
 * so the `value` setter can skip no-ops, and if the Model rejects the edit the
 * host calls the setter again with the last value after the event finishes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ViewKind {
  /** Fabric component name, or a function of the node and host. */
  readonly viewName: string | ((node: NativeNode, host: ViewHost) => string)
  /** Processed Fabric props used at mount and restored when an override is removed. */
  readonly defaults?:
    | Readonly<Record<string, unknown>>
    | ((host: ViewHost) => Readonly<Record<string, unknown>>)
    | undefined
  /** Whether raw text may sit directly inside this view (nesting uses virtual text). */
  readonly text?: boolean | undefined
  /** Inner content container created automatically for children, as in `scroll`. */
  readonly content?:
    | Pick<ViewKind, "viewName" | "defaults" | "events">
    | undefined
  /**
   * Attaches the node to its parent element instead of rendering it among the
   * parent's children, as a refresh control attaches to its scroll view. A
   * parent holds one attached node: a new one replaces the last.
   *
   * Without a result, the node renders as the parent's first native child,
   * ahead of its content view. With one, the node renders around the parent
   * and takes the parent's props whose names match `outer`, such as its
   * margins. `props` are the parent's defaults while wrapped.
   */
  readonly attach?:
    | ((host: ViewHost) =>
      | {
        readonly outer: RegExp
        readonly props: Readonly<Record<string, unknown>>
      }
      | undefined)
    | undefined
  /** Custom prop setters by prop name. */
  readonly props?:
    | Readonly<
      Record<string, (node: NativeNode, value: unknown, host: ViewHost) => void>
    >
    | undefined
  /** Custom hooks by native event name (e.g. `topChange`). */
  readonly events?:
    | Readonly<
      Record<string, (node: NativeNode, payload: any, host: ViewHost) => void>
    >
    | undefined
}

/**
 * Registers `kind` for the builder returned by `make` and returns that
 * builder. Construct the builder inside `make` so bundlers tree-shake the
 * entire definition, builder included, when unused. Re-defining a tag replaces
 * it (reloading under Fast Refresh).
 *
 * **Example** (An activity indicator)
 *
 * ```ts
 * import { Native } from "@effect/ui-native"
 *
 * const spinner = Native.defineView(() => new Native.Element("spinner"), {
 *   viewName: (_, host) =>
 *     host.os === "ios" ? "ActivityIndicatorView" : "AndroidProgressBar",
 *   defaults: { animating: true, styleAttr: "Normal", indeterminate: true }
 * })
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const defineView = /* @__NO_SIDE_EFFECTS__ */ <
  B extends View.ElementBuilder<any, any, any, any, any>
>(make: () => B, kind: ViewKind): B => {
  const builder = make()
  kinds.set(builder.tag, kind)
  return builder
}

/**
 * Any child of a `view` or a `scroll`. Text must be inside a `text`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NoTextInput<Msg, R = never> =
  | View.Element<Msg, R>
  | View.Child<Msg, R>
  | View.Outlet
  | View.ElementBuilder<Msg, R, any, any>
  | false
  | null
  | undefined
  | ReadonlyArray<
    | View.Element<Msg, R>
    | View.Child<Msg, R>
    | View.Outlet
    | View.ElementBuilder<Msg, R, any, any>
    | false
    | null
    | undefined
  >

/**
 * The builder of every native element. `style` and `prop` both set
 * native props: `style` takes React Native's style names, and `prop` its
 * other props.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging
export class Element<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  out Tag extends string = string,
  in Style extends object = ViewStyle,
  in out Props extends object = ViewProps
> extends View.ElementBuilder<Msg, R, E, NativeNode, Tag> {
  /**
   * Phantom: keeps the native builder type through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: Element<
    Msg,
    R | this["~Add"],
    E,
    Tag,
    Style,
    Props
  >

  /**
   * Sets style properties. A later call merges with earlier ones, and
   * `undefined` removes a property.
   *
   * @since 0.1.0
   */
  style(style: Style): this {
    let props: Record<string, unknown> | undefined
    for (const key in style) {
      const value = (style as Record<string, unknown>)[key]
      props ??= { ...this.props }
      if (value === undefined) delete props[key]
      else props[key] = value
    }
    return props === undefined ? this : View.withFields(this, { props })
  }
}

/**
 * Types `prop` by the element's `Props`. A name `Props` doesn't list takes
 * any value, for native props without a type.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Element<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  out Tag extends string = string,
  in Style extends object = ViewStyle,
  in out Props extends object = ViewProps
> {
  /**
   * Sets a native prop, or removes it with `undefined`.
   *
   * @since 0.1.0
   */
  prop<K extends (keyof Props & string) | (string & {})>(
    name: K,
    value: K extends keyof Props ? Props[K] : unknown
  ): this
}

/**
 * The builder of `view`, and the base of `scroll`. Their children can't be
 * text.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class ViewElement<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  out Tag extends string = string
> extends Element<Msg, R, E, Tag, ViewStyle> {
  /**
   * Phantom: keeps `children` through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: ViewElement<Msg, R | this["~Add"], E, Tag>

  /**
   * Adds children. Text is rejected: wrap it in `h.text(...)`.
   *
   * @since 0.1.0
   */
  children<This, const C extends ReadonlyArray<NoTextInput<Msg, unknown>>>(
    this: This,
    ...inputs: C
  ): View.WithRequirements<This, View.Requirements<C[number]>>
  children(...inputs: ReadonlyArray<View.Input<Msg, unknown>>): unknown {
    return View.withNoTextContent(this, inputs, vocabulary)
  }
}

/**
 * The builder of `scroll`. Its children are laid out in a content view that
 * scrolls inside it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class ScrollElement<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  out Tag extends string = string
> extends ViewElement<Msg, R, E, Tag> {
  /**
   * Phantom: keeps `children` through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: ScrollElement<Msg, R | this["~Add"], E, Tag>

  /**
   * Scrolls sideways instead of down, laying the content out in a row.
   *
   * @since 0.1.0
   */
  horizontal(horizontal = true): this {
    return this.prop("horizontal", horizontal)
  }

  /**
   * Styles the content view, such as its padding or the alignment of the
   * children. A later call merges with earlier ones, and `undefined` removes
   * a property.
   *
   * @since 0.1.0
   */
  contentContainerStyle(style: ViewStyle): this {
    return this.prop("contentContainerStyle", {
      ...(this.props.contentContainerStyle as object),
      ...style
    })
  }

  /**
   * Sends at most one `scroll` event per `ms` milliseconds. 0 through 16
   * leave events unthrottled.
   *
   * @since 0.1.0
   */
  scrollEventThrottle(ms: number): this {
    return this.prop("scrollEventThrottle", ms)
  }
}

/**
 * The builder of `text`, which holds strings and nested `text`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class TextElement<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  out Tag extends string = string
> extends Element<Msg, R, E, Tag, TextStyle, TextProps> {
  /**
   * Phantom: keeps `children` through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: TextElement<Msg, R | this["~Add"], E, Tag>

  /**
   * Adds text and nested `text`.
   *
   * @since 0.1.0
   */
  children<This, const C extends ReadonlyArray<View.Input<Msg, unknown>>>(
    this: This,
    ...inputs: C
  ): View.WithRequirements<This, View.Requirements<C[number]>>
  children(...inputs: ReadonlyArray<View.Input<Msg, unknown>>): unknown {
    return View.withContent(this, inputs)
  }
}

/**
 * The builder of `input`, a single-line or multiline text field.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class InputElement<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  out Tag extends string = string
> extends Element<Msg, R, E, Tag, TextStyle, InputProps> {
  /**
   * Phantom: keeps the builder type through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: InputElement<Msg, R | this["~Add"], E, Tag>

  /**
   * Sets the text. An edit native has made since is replaced.
   *
   * @since 0.1.0
   */
  value(value: string): this {
    return this.prop("value", value)
  }

  /**
   * Sets the text shown while the field is empty.
   *
   * @since 0.1.0
   */
  placeholder(placeholder: string | undefined): this {
    return this.prop("placeholder", placeholder)
  }
}

/**
 * The element builders the native vocabulary adds to `h`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export interface Tags<Msg> {
  readonly view: View.Shorthand<ViewElement<Msg, never, ViewEvents, "view">>
  readonly scroll: View.Shorthand<
    ScrollElement<Msg, never, ScrollEvents, "scroll">
  >
  readonly text: View.Shorthand<TextElement<Msg, never, TextEvents, "text">>
  readonly input: InputElement<Msg, never, InputEvents, "input">
}

/**
 * A native tag name.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export type TagName = keyof Tags<unknown>

/**
 * The type-level native vocabulary.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export interface Elements extends View.Elements {
  readonly Tags: Tags<this["Msg"]>
  readonly Host: Host
}

/**
 * The view helper for pure native view functions, without a component.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type H<Msg> = View.WithTags<Msg, unknown, Elements>

/**
 * Phantom type carrier so the `Native` module namespace satisfies
 * `View.Vocabulary<Elements>`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const Elements: Elements | undefined = undefined

/**
 * The vocabulary name matched against `Host.elements`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const name = "native"

/**
 * The element builders installed on `h`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const tags: Readonly<
  Record<TagName, Element<any, any, any, any, any, any>>
> = {
  view: View.shorthand(new ViewElement("view")),
  scroll: View.shorthand(new ScrollElement("scroll")),
  text: View.shorthand(new TextElement("text")),
  input: new InputElement("input")
}

/**
 * The native vocabulary, for `Component.define({ elements })`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const vocabulary: View.Vocabulary<Elements> = {
  name,
  tags,
  textParents: ["text"]
}

/**
 * Defines a component with the native vocabulary, as
 * `Component.define({ ...options, elements: Native.vocabulary })`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const component: Component.Define<Elements> = Component.withElements(
  vocabulary
)

/**
 * Declares a ref to a native node, for the operations of `Host`.
 *
 * @stability experimental
 * @category refs
 * @since 0.1.0
 */
export const ref = (name: string): Renderer.Ref<NativeNode> =>
  Renderer.ref<NativeNode>(name)
