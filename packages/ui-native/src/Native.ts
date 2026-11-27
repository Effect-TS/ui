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
import type { NativeNode } from "./NativeHost.ts"

/**
 * A colour as React Native parses it: a CSS colour string or a number.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Color = string | number

/**
 * A length in density-independent pixels, a percentage, or `"auto"`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Dimension = number | `${number}%` | "auto"

/**
 * Layout properties, which Yoga applies as CSS flexbox with
 * `flexDirection: "column"` by default.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface LayoutStyle {
  readonly display?: "flex" | "none" | "contents" | undefined
  readonly position?: "relative" | "absolute" | "static" | undefined
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
  readonly margin?: Dimension | undefined
  readonly marginHorizontal?: Dimension | undefined
  readonly marginVertical?: Dimension | undefined
  readonly marginTop?: Dimension | undefined
  readonly marginRight?: Dimension | undefined
  readonly marginBottom?: Dimension | undefined
  readonly marginLeft?: Dimension | undefined
  readonly padding?: Dimension | undefined
  readonly paddingHorizontal?: Dimension | undefined
  readonly paddingVertical?: Dimension | undefined
  readonly paddingTop?: Dimension | undefined
  readonly paddingRight?: Dimension | undefined
  readonly paddingBottom?: Dimension | undefined
  readonly paddingLeft?: Dimension | undefined
  readonly overflow?: "visible" | "hidden" | "scroll" | undefined
  readonly zIndex?: number | undefined
}

/**
 * Style properties of a `view`, a `scroll` and an `input`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ViewStyle extends LayoutStyle {
  readonly backgroundColor?: Color | undefined
  readonly opacity?: number | undefined
  readonly borderWidth?: number | undefined
  readonly borderTopWidth?: number | undefined
  readonly borderRightWidth?: number | undefined
  readonly borderBottomWidth?: number | undefined
  readonly borderLeftWidth?: number | undefined
  readonly borderColor?: Color | undefined
  readonly borderTopColor?: Color | undefined
  readonly borderRightColor?: Color | undefined
  readonly borderBottomColor?: Color | undefined
  readonly borderLeftColor?: Color | undefined
  readonly borderRadius?: number | undefined
  readonly borderTopLeftRadius?: number | undefined
  readonly borderTopRightRadius?: number | undefined
  readonly borderBottomLeftRadius?: number | undefined
  readonly borderBottomRightRadius?: number | undefined
  readonly borderStyle?: "solid" | "dotted" | "dashed" | undefined
  readonly elevation?: number | undefined
  readonly pointerEvents?: "auto" | "none" | "box-none" | "box-only" | undefined
}

/**
 * Style properties of `text`. Nested `text` inherits them.
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
  readonly letterSpacing?: number | undefined
  readonly lineHeight?: number | undefined
  readonly textAlign?:
    | "auto"
    | "left"
    | "right"
    | "center"
    | "justify"
    | undefined
  readonly textDecorationLine?:
    | "none"
    | "underline"
    | "line-through"
    | "underline line-through"
    | undefined
  readonly textDecorationColor?: Color | undefined
  readonly textTransform?:
    | "none"
    | "capitalize"
    | "uppercase"
    | "lowercase"
    | undefined
  /** Truncates the text to this many lines. */
  readonly numberOfLines?: number | undefined
  readonly selectable?: boolean | undefined
}

/**
 * Props of an `input`, set with `.prop(name, value)`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface InputProps {
  readonly value?: string | undefined
  /** Initial text for an uncontrolled input; changing it replaces the text. */
  readonly defaultValue?: string | undefined
  readonly placeholder?: string | undefined
  readonly placeholderTextColor?: Color | undefined
  readonly selectionColor?: Color | undefined
  /**
   * Allows multiple lines of text. On iOS, React Native adds `paddingTop: 5`
   * when no padding is set; set padding explicitly in `.style()` if needed.
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
  readonly contentSize: {
    readonly width: number
    readonly height: number
  }
}

/**
 * The events of a `view`. A press ends on the element, or at most 20 points
 * outside it. `layout` fires when layout changes the element's position or
 * size.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ViewEvents {
  readonly press: PressPayload
  readonly layout: LayoutPayload
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
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ScrollEvents extends ViewEvents {
  readonly scroll: ScrollPayload
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
  /** `undefined` until the node has been committed. */
  readonly measure: (node: NativeNode) => Rect | undefined
  /** Runs a native command, such as `scrollToEnd`. Does nothing before the node's first commit. */
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
}

/**
 * How the host renders an element: its Fabric view name, defaults, prop
 * setters, and native event hooks.
 *
 * **Details**
 *
 * Props without a setter go straight to Fabric. Native events without a hook
 * (such as `topLayout`) dispatch directly to the matching handler (`layout`)
 * without bubbling, and binding that handler sets `onLayout: true` on Fabric.
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
  /** Initial Fabric props for every created node. */
  readonly defaults?: Readonly<Record<string, unknown>> | undefined
  /** Whether raw text may sit directly inside this view (nesting uses virtual text). */
  readonly text?: boolean | undefined
  /** Inner content container created automatically for children, as in `scroll`. */
  readonly content?: Pick<ViewKind, "viewName" | "defaults"> | undefined
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
 * The builder of every native element. `style` and `prop` both set native
 * props: `style` takes React Native's style names, and `prop` its other props.
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
  in out Props extends object = Record<string, unknown>
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
  in out Props extends object = Record<string, unknown>
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
 * The builder of `view` and `scroll`, whose children can't be text.
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

  /**
   * Scrolls a `scroll` sideways instead of down.
   *
   * @since 0.1.0
   */
  horizontal(this: ViewElement<Msg, R, E, "scroll">, horizontal = true): this {
    return this.prop("horizontal", horizontal) as this
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
> extends Element<Msg, R, E, Tag, TextStyle> {
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
    ViewElement<Msg, never, ScrollEvents, "scroll">
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
  scroll: View.shorthand(new ViewElement("scroll")),
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
