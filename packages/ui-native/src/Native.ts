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
 * Style properties of an `input`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface InputStyle extends TextStyle {
  readonly placeholderTextColor?: Color | undefined
  readonly selectionColor?: Color | undefined
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
 * An element's position in its parent and its size, in points, after
 * layout.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface LayoutPayload {
  readonly layout: Rect
}

/**
 * The events of a `view` and a `text`. A press ends on the element, or
 * at most 20 points outside it. `layout` fires when layout changes the
 * element's position or size.
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
 * The events of an `input`. `input` fires on every edit and `submit` when
 * the keyboard's return key is pressed.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface InputEvents {
  readonly input: ValuePayload
  readonly submit: ValuePayload
  readonly focus: {}
  readonly blur: {}
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
 * What a {@link ViewKind}'s hooks can do to a node.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ViewHost {
  /** `Platform.OS` of the running app. */
  readonly os: string
  /**
   * Sets a Fabric prop, sent at the next commit. A prop whose name ends in
   * `Color` is processed as a colour.
   */
  readonly set: (node: NativeNode, name: string, value: unknown) => void
  /** Turns a colour into the value Fabric parses, for colours nested in a prop. */
  readonly color: (value: unknown) => unknown
  /** Runs a native command. Does nothing before the node's first commit. */
  readonly command: (
    node: NativeNode,
    name: string,
    args?: ReadonlyArray<unknown> | undefined
  ) => void
  /** Runs the node's own handler for `event`, if it has one. */
  readonly fire: (node: NativeNode, event: string, payload: unknown) => void
}

/**
 * How the host renders an element: the native view it creates and what the
 * host does with its props and events.
 *
 * **Details**
 *
 * A prop without a setter in `props` is sent to Fabric as it is. A native
 * event without a hook in `events`, such as `topLayout`, runs the
 * element's own `layout` handler with the native payload, and doesn't reach
 * its ancestors. Binding the handler sets `onLayout: true`, which native
 * checks before it sends the event.
 *
 * A `value` prop is controlled. When native edits it, as a text field does,
 * the kind's `events` hook records what native shows, so the `value` setter
 * can skip a value native already shows. If the Model doesn't take the
 * edit, the host calls the setter with the last value again once the event
 * has run, and the setter sends it back.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ViewKind {
  /** Fabric's component name, or a function of the node, such as the platform's name. */
  readonly viewName: string | ((node: NativeNode, host: ViewHost) => string)
  /** Props every node starts with. */
  readonly defaults?: Readonly<Record<string, unknown>> | undefined
  /** Raw text may sit inside. Text inside it is virtual text. */
  readonly text?: boolean | undefined
  /** An inner view that holds the children, as a scroll view's content view. */
  readonly content?: Pick<ViewKind, "viewName" | "defaults"> | undefined
  /** Setters by prop name, for a prop that needs more than sending it. */
  readonly props?:
    | Readonly<
      Record<string, (node: NativeNode, value: unknown, host: ViewHost) => void>
    >
    | undefined
  /** Hooks by native event name, such as `topChange`, for an event that needs more than its payload. */
  readonly events?:
    | Readonly<
      Record<string, (node: NativeNode, payload: any, host: ViewHost) => void>
    >
    | undefined
}

/**
 * Makes the tag of the builder `make` returns render as `kind`, and returns
 * that builder. A bundler drops the whole definition, builder included,
 * from an app that never renders the builder, so keep the call to the
 * builder's constructor inside `make`. A later definition of the same tag
 * replaces it, as Fast Refresh needs.
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
 * The builder of every native element. Its `style` sets native props.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class Element<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  out Tag extends string = string,
  in Style extends object = ViewStyle
> extends View.ElementBuilder<Msg, R, E, NativeNode, Tag> {
  /**
   * Phantom: keeps the native builder type through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: Element<Msg, R | this["~Add"], E, Tag, Style>

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
 * The builder of `input`, a single-line text field.
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
> extends Element<Msg, R, E, Tag, InputStyle> {
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
  readonly text: View.Shorthand<TextElement<Msg, never, ViewEvents, "text">>
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
export const tags: Readonly<Record<TagName, Element<any, any, any, any, any>>> =
  {
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
