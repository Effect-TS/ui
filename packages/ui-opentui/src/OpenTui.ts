/**
 * The OpenTUI element vocabulary for `@effect/ui`: terminal tags on `h`,
 * typed plain-data event payloads, controlled properties, the `OpenTui.Host`
 * marker, and refs typed by renderable.
 *
 * Define OpenTUI components with `OpenTui.component`, which supplies the
 * OpenTUI vocabulary automatically, and type reusable pure OpenTUI view
 * functions with `OpenTui.H<Msg>`.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Renderer from "@effect/ui/Renderer"
import * as View from "@effect/ui/View"
import type * as OT from "@opentui/core"
import * as Context from "effect/Context"

/**
 * The layout bounds of a rendered OpenTUI node, in terminal cells.
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
 * A scroll target position for a scrollbox, in terminal cells.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ScrollPosition =
  | number
  | { readonly x: number; readonly y: number }

/**
 * The OpenTUI host marker and imperative element operations used by
 * `OpenTuiCommand`. Provided by `OpenTuiHost.layer`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export class Host extends Context.Service<Host, {
  readonly focus: (node: OT.Renderable) => void
  readonly blur: (node: OT.Renderable) => void
  readonly scrollTo: (
    node: OT.ScrollBoxRenderable,
    position: ScrollPosition
  ) => void
  readonly scrollBy: (
    node: OT.ScrollBoxRenderable,
    delta: ScrollPosition
  ) => void
  readonly measure: (node: OT.Renderable) => Rect
  readonly quit: () => void
}>()("@effect/ui-opentui/OpenTui/Host") {}

declare module "@effect/ui/Command" {
  interface FrameworkServices {
    readonly OpenTuiHost: Host
  }
}

/**
 * Plain-data payload for key events on renderables and global key
 * Subscriptions.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface KeyPayload {
  readonly key: string
  readonly sequence: string
  readonly ctrl: boolean
  readonly shift: boolean
  readonly meta: boolean
  readonly option: boolean
  readonly repeat: boolean
  readonly eventType: "press" | "repeat" | "release"
  readonly editable: boolean
}

/**
 * Scroll wheel details carried on `mousescroll` payloads.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface MouseScrollInfo {
  readonly direction: "up" | "down" | "left" | "right"
  readonly delta: number
}

/**
 * Plain-data payload for mouse events on renderables.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface MousePayload {
  readonly x: number
  readonly y: number
  readonly button: number
  readonly shift: boolean
  readonly alt: boolean
  readonly ctrl: boolean
  readonly scroll?: MouseScrollInfo | undefined
}

/**
 * Plain-data payload for paste events.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface PastePayload {
  readonly text: string
}

/**
 * Plain-data payload for terminal resize events.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ResizePayload {
  readonly width: number
  readonly height: number
}

/**
 * Plain-data payload for text value events (`input`, `change`, `enter`).
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ValuePayload {
  readonly value: string
}

/**
 * Plain-data payload for `select` and `tabSelect` events (`selectionChanged`,
 * `itemSelected`).
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface SelectPayload {
  readonly index: number
  readonly option: OT.SelectOption | null
}

/**
 * Plain-data payload for `slider` `change` events.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface SliderPayload {
  readonly value: number
}

/**
 * Plain-data payload for `focus` events.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface FocusPayload {}

/**
 * Plain-data payload for `blur` events.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface BlurPayload {}

/**
 * Shared events available on every OpenTUI layout renderable.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface Events {
  readonly mousedown: MousePayload
  readonly mouseup: MousePayload
  readonly mousemove: MousePayload
  readonly mouseover: MousePayload
  readonly mouseout: MousePayload
  readonly mousescroll: MousePayload
  readonly keydown: KeyPayload
  readonly paste: PastePayload
  readonly focus: FocusPayload
  readonly blur: BlurPayload
}

/**
 * Events available on a specific OpenTUI tag.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export type EventsOf<K extends string> = K extends "input" ?
    & Events
    & {
      readonly input: ValuePayload
      readonly change: ValuePayload
      readonly enter: ValuePayload
    }
  : K extends "textarea" ?
      & Events
      & {
        readonly input: ValuePayload
        readonly submit: ValuePayload
      }
  : K extends "select" | "tabSelect" ?
      & Events
      & {
        readonly selectionChanged: SelectPayload
        readonly itemSelected: SelectPayload
      }
  : K extends "slider" ?
      & Events
      & {
        readonly change: SliderPayload
      }
  : K extends TextModifierTag | "br" ? {}
  : Events

type OmittedOptionKeys =
  | "id"
  | "value"
  | "initialValue"
  | "selectedIndex"
  | "content"
  | "renderBefore"
  | "renderAfter"
  | "onChange"
  | "onMouse"
  | "onMouseDown"
  | "onMouseUp"
  | "onMouseMove"
  | "onMouseDrag"
  | "onMouseDragEnd"
  | "onMouseDrop"
  | "onMouseOver"
  | "onMouseOut"
  | "onMouseScroll"
  | "onPaste"
  | "onKeyDown"
  | "onSizeChange"
  | "onSubmit"
  | "onCursorChange"
  | "onContentChange"

/**
 * Strips event callbacks, render hooks, identity and controlled state from an
 * OpenTUI renderable's options type for use with `.style(...)`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type StyleOf<O> = {
  readonly [K in Exclude<keyof O, OmittedOptionKeys>]?: O[K] | undefined
}

/**
 * Mapping from OpenTUI tag name to its style options accepted by `.style(...)`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TagStyleMap {
  readonly box: StyleOf<OT.BoxOptions>
  readonly scrollbox: StyleOf<OT.ScrollBoxOptions>
  readonly lineNumber: Omit<
    StyleOf<OT.LineNumberOptions>,
    "target" | "minWidth" | "paddingRight"
  >
  readonly text: StyleOf<OT.TextOptions>
  readonly span: StyleOf<OT.TextNodeOptions>
  readonly b: StyleOf<OT.TextNodeOptions>
  readonly i: StyleOf<OT.TextNodeOptions>
  readonly u: StyleOf<OT.TextNodeOptions>
  readonly a: StyleOf<OT.TextNodeOptions>
  readonly br: StyleOf<OT.TextNodeOptions>
  readonly input: StyleOf<OT.InputRenderableOptions>
  readonly textarea: StyleOf<OT.TextareaOptions>
  readonly select: StyleOf<OT.SelectRenderableOptions>
  readonly tabSelect: StyleOf<OT.TabSelectRenderableOptions>
  readonly slider: StyleOf<OT.SliderOptions>
  readonly code: StyleOf<OT.CodeOptions> & {
    readonly content?: string | undefined
  }
  readonly diff: StyleOf<OT.DiffRenderableOptions>
  readonly markdown: StyleOf<OT.MarkdownOptions> & {
    readonly content?: string | undefined
  }
  readonly asciiFont: StyleOf<OT.ASCIIFontOptions>
}

/**
 * Mapping from OpenTUI tag name to its runtime renderable class.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TagNodeMap {
  readonly box: OT.BoxRenderable
  readonly scrollbox: OT.ScrollBoxRenderable
  readonly lineNumber: OT.LineNumberRenderable
  readonly text: OT.TextRenderable
  readonly span: OT.TextNodeRenderable
  readonly b: OT.TextNodeRenderable
  readonly i: OT.TextNodeRenderable
  readonly u: OT.TextNodeRenderable
  readonly a: OT.TextNodeRenderable
  readonly br: OT.TextNodeRenderable
  readonly input: OT.InputRenderable
  readonly textarea: OT.TextareaRenderable
  readonly select: OT.SelectRenderable
  readonly tabSelect: OT.TabSelectRenderable
  readonly slider: OT.SliderRenderable
  readonly code: OT.CodeRenderable
  readonly diff: OT.DiffRenderable
  readonly markdown: OT.MarkdownRenderable
  readonly asciiFont: OT.ASCIIFontRenderable
}

/**
 * Content allowed inside a layout container (`box`, `scrollbox`): elements,
 * child components, slots, and element builders, excluding plain text nodes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NoTextContent<Msg, R = never> =
  | View.Element<Msg, R>
  | View.Child<Msg, R>
  | View.Outlet
  | View.ElementBuilder<Msg, R, any, any>

/**
 * A readonly array of non-text children for layout containers.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NoTextChildren<Msg, R = any> = ReadonlyArray<
  NoTextContent<Msg, R> | false | null | undefined
>

/**
 * One child argument accepted by a layout container (`box`, `scrollbox`).
 * Strings and `View.Text` are rejected at compile time and runtime.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NoTextInput<Msg, R = never> =
  | NoTextContent<Msg, R>
  | false
  | null
  | undefined
  | NoTextChildren<Msg, R>

const mergeProps = <B extends View.ElementBuilder<any, any, any, any>>(
  builder: B,
  options: Readonly<Record<string, unknown>>
): B => {
  let next: Record<string, unknown> | undefined
  for (const key in options) {
    if (!Object.hasOwn(options, key)) continue
    const value = options[key]
    next ??= { ...builder.props }
    if (value === undefined) delete next[key]
    else next[key] = value
  }
  return next === undefined
    ? builder
    : View.withFields(builder, { props: next })
}

/**
 * Base builder for OpenTUI elements that do not take children (such as
 * `input`, `textarea`, `select`, and `br`).
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class VoidElement<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  in out Node = unknown,
  out Tag extends string = string,
  in Options extends object = Record<string, unknown>
> extends View.ElementBuilder<Msg, R, E, Node, Tag> {
  /**
   * Phantom: keeps the OpenTUI builder type through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: VoidElement<
    Msg,
    R | this["~Add"],
    E,
    Node,
    Tag,
    Options
  >

  /**
   * Merges typed renderable options into the element's host properties.
   * Repeated calls merge with earlier calls; `undefined` removes an option.
   *
   * @since 0.1.0
   */
  style(options: Options): this {
    return mergeProps(this, options as Readonly<Record<string, unknown>>)
  }

  /**
   * Controls whether this renderable holds terminal focus.
   *
   * @since 0.1.0
   */
  focused<N extends OT.Renderable>(
    this: VoidElement<Msg, R, E, N, Tag, Options>,
    focused: boolean
  ): this {
    return this.prop("focused", focused) as any
  }

  /**
   * Sets whether this renderable is visible.
   *
   * @since 0.1.0
   */
  visible<N extends OT.Renderable>(
    this: VoidElement<Msg, R, E, N, Tag, Options>,
    visible: boolean
  ): this {
    return this.prop("visible", visible) as any
  }

  /**
   * Sets the controlled value of an `input`, `textarea`, or `slider`.
   *
   * @since 0.1.0
   */
  value<
    N extends OT.InputRenderable | OT.TextareaRenderable | OT.SliderRenderable
  >(
    this: VoidElement<Msg, R, E, N, Tag, Options>,
    value: N extends OT.SliderRenderable ? number : string
  ): this {
    return this.prop("value", value) as any
  }

  /**
   * Sets the placeholder text of an `input` or `textarea`.
   *
   * @since 0.1.0
   */
  placeholder<N extends OT.InputRenderable | OT.TextareaRenderable>(
    this: VoidElement<Msg, R, E, N, Tag, Options>,
    placeholder: string | null
  ): this {
    return this.prop("placeholder", placeholder) as any
  }

  /**
   * Sets the items displayed by a `select` or `tabSelect`.
   *
   * @since 0.1.0
   */
  options<N extends OT.SelectRenderable | OT.TabSelectRenderable>(
    this: VoidElement<Msg, R, E, N, Tag, Options>,
    options: ReadonlyArray<OT.SelectOption>
  ): this {
    return this.prop("options", options) as any
  }

  /**
   * Sets the controlled selected index of a `select` or `tabSelect`.
   *
   * @since 0.1.0
   */
  selectedIndex<N extends OT.SelectRenderable | OT.TabSelectRenderable>(
    this: VoidElement<Msg, R, E, N, Tag, Options>,
    index: number
  ): this {
    return this.prop("selectedIndex", index) as any
  }

  /**
   * Sets the title of a `box` or `scrollbox`.
   *
   * @since 0.1.0
   */
  title<N extends OT.BoxRenderable>(
    this: VoidElement<Msg, R, E, N, Tag, Options>,
    title: string | undefined
  ): this {
    return this.prop("title", title) as any
  }

  /**
   * Sets the hyperlink URL on an `a` text modifier.
   *
   * @since 0.1.0
   */
  href(
    this: VoidElement<Msg, R, E, OT.TextNodeRenderable, "a", Options>,
    url: string | undefined
  ): this {
    return this.prop("link", url === undefined ? undefined : { url }) as any
  }
}

/**
 * Builder for OpenTUI layout containers (`box`, `scrollbox`). Rejects plain
 * text children at compile time and runtime.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class LayoutElement<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  in out Node = unknown,
  out Tag extends string = string,
  in Options extends object = Record<string, unknown>
> extends VoidElement<Msg, R, E, Node, Tag, Options> {
  /**
   * Phantom: keeps `children` through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: LayoutElement<
    Msg,
    R | this["~Add"],
    E,
    Node,
    Tag,
    Options
  >

  /**
   * Adds element and child component children. Plain strings and `View.Text`
   * are rejected; wrap text in `h.text(...)`.
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
 * Builder for OpenTUI text containers (`text`, `span`, `b`, `i`, `u`, `a`).
 * Accepts strings, text nodes, and inline text modifiers.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class TextElement<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  in out Node = unknown,
  out Tag extends string = string,
  in Options extends object = Record<string, unknown>
> extends VoidElement<Msg, R, E, Node, Tag, Options> {
  /**
   * Phantom: keeps `children` through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: TextElement<
    Msg,
    R | this["~Add"],
    E,
    Node,
    Tag,
    Options
  >

  /**
   * Adds text and inline text children.
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
 * Layout container tags that accept non-text children.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const layoutTags = ["box", "scrollbox", "lineNumber"] as const

/**
 * Inline text modifier tags that live inside `text`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const textModifierTags = ["span", "b", "i", "u", "a"] as const

/**
 * All tags allowed to hold text directly.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const textParents = ["text", ...textModifierTags] as const

/**
 * Tags that take no children.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const voidTags = [
  "input",
  "textarea",
  "select",
  "tabSelect",
  "slider",
  "code",
  "diff",
  "markdown",
  "asciiFont",
  "br"
] as const

/**
 * A layout container tag name.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export type LayoutTag = typeof layoutTags[number]

/**
 * An inline text modifier tag name.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export type TextModifierTag = typeof textModifierTags[number]

/**
 * A tag name allowed to hold text directly.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export type TextParentTag = typeof textParents[number]

/**
 * A void tag name.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export type VoidTag = typeof voidTags[number]

/**
 * Any built-in OpenTUI tag name.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export type TagName = LayoutTag | TextParentTag | VoidTag

/**
 * The element builders the OpenTUI vocabulary adds to `h`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export type Tags<Msg> =
  & {
    readonly [K in LayoutTag]: View.Shorthand<
      LayoutElement<Msg, never, EventsOf<K>, TagNodeMap[K], K, TagStyleMap[K]>
    >
  }
  & {
    readonly [K in TextParentTag]: View.Shorthand<
      TextElement<Msg, never, EventsOf<K>, TagNodeMap[K], K, TagStyleMap[K]>
    >
  }
  & {
    readonly [K in VoidTag]: VoidElement<
      Msg,
      never,
      EventsOf<K>,
      TagNodeMap[K],
      K,
      TagStyleMap[K]
    >
  }

/**
 * The type-level OpenTUI vocabulary.
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
 * The view helper for reusable pure OpenTUI view functions, without a
 * component definition.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type H<Msg> = View.WithTags<Msg, unknown, Elements>

/**
 * Phantom type carrier so the `OpenTui` module namespace satisfies
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
export const name = "opentui"

const makeTags = (): Readonly<
  Record<string, VoidElement<any, any, any, any, any, any>>
> => {
  const out: Record<string, VoidElement<any, any, any, any, any, any>> = {}
  for (const tag of layoutTags) {
    out[tag] = View.shorthand(new LayoutElement(tag))
  }
  for (const tag of textParents) {
    out[tag] = View.shorthand(new TextElement(tag))
  }
  for (const tag of voidTags) {
    out[tag] = new VoidElement(tag)
  }
  return out
}

/**
 * Root element builders installed on `h`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const tags: Readonly<
  Record<string, VoidElement<any, any, any, any, any, any>>
> = makeTags()

/**
 * Standalone OpenTUI vocabulary value for `Component.define({ elements })`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const vocabulary: View.Vocabulary<Elements> = {
  name,
  tags,
  textParents
}

/**
 * Defines a component with the OpenTUI element vocabulary already supplied,
 * equivalent to `Component.define({ ...options, elements: OpenTui.vocabulary })`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const component: Component.Define<Elements> = Component
  .withElements(vocabulary)

/**
 * Declares a ref typed to the OpenTUI renderable of `tag`.
 *
 * @stability experimental
 * @category refs
 * @since 0.1.0
 */
export const ref = <K extends TagName>(
  name: string,
  _tag: K
): Renderer.Ref<TagNodeMap[K]> => Renderer.ref<TagNodeMap[K]>(name)
