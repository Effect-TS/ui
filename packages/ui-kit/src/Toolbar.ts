/**
 * A row or column of controls, such as buttons, toggle groups, menus and a
 * search input, that takes one stop in the Tab order and moves focus between
 * its controls with the arrow keys.
 *
 * `Toolbar` is a headless component. It keeps which item holds the tab stop,
 * and moves focus between the items through a Command. It emits nothing: each
 * control inside reports its own press, toggle or choice.
 *
 * **Anatomy**
 *
 * | Part        | Element                                |
 * | :---------- | :------------------------------------- |
 * | `root`      | `<div>`                                |
 * | `group`     | `<div>`, around some of the items      |
 * | `button`    | `<button>`, one for each button item   |
 * | `link`      | `<a>`, one for each link item          |
 * | `input`     | `<input>`, one for each input item     |
 * | `separator` | `<div>`, between items                 |
 *
 * `root` and `separator` take the consumer's builder and return it, so the
 * consumer goes on chaining and adds children with `.children(...)`. `group`,
 * `button`, `link` and `input` take `{ element, value }`: the builder and the
 * `value` of one entry in the `groups` or `items` prop. A `value` that isn't
 * there fails the render. No part adds markup.
 *
 * An item part is the element of another kit call too. Stack it inside a
 * trigger or a toggle group item, and pass the result to `Button`:
 *
 * - `toolbar.button({ element: menu.trigger(h.button), value })`, and the same
 *   for the trigger of a `Select`, `Popover`, `Dialog` or `AlertDialog`
 * - `toolbar.button({ element: toggleGroup.item({ element: h.button, value }), value })`
 * - `tooltip.trigger(toolbar.button({ element: h.button, value }))`
 * - `Button(h, { element: toolbar.button({ element: h.button, value }), onPress })`
 *
 * A `ToggleGroup` inside a toolbar leaves the tab stop and the arrow keys to
 * the toolbar, and is disabled with it.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except `data-orientation`,
 * which holds an orientation:
 *
 * - `root`, `group`: `data-orientation` and `data-disabled`
 * - `button`, `input`: `data-orientation`, `data-disabled` and
 *   `data-focusable`, present while the item stays focusable when disabled
 * - `link`: `data-orientation`
 * - `separator`: `data-orientation`, across the toolbar's: `"vertical"` in
 *   a horizontal toolbar
 *
 * **Keyboard**
 *
 * Only one item is in the Tab order: the one focused last, or else the first
 * item that can take focus. A key handler on each item moves focus:
 *
 * | Key         | Action                                     |
 * | :---------- | :----------------------------------------- |
 * | Right, Left | next and previous item, horizontally       |
 * | Down, Up    | next and previous item, vertically         |
 * | Home, End   | first and last item, from a button or link |
 *
 * The arrow keys follow `orientation`, and with `loopFocus` they wrap from
 * the last item to the first and back. A disabled item stays in the order
 * unless its entry sets `focusableWhenDisabled: false`. Inside a
 * `DirectionProvider` with `direction: "rtl"`, Left and Right swap. A key held
 * with Alt, Ctrl, Meta or Shift does nothing.
 *
 * In a text input, the arrow keys move the caret, and leave the input only
 * from the end of the text, or from its start for the previous item. Home,
 * End and a selection stay with the input. An input reached with the arrow
 * keys has its text selected.
 *
 * **Usage**
 *
 * The `items` prop lists every item in the order they are drawn, so the
 * toolbar can move focus without reading the page. Draw one item part for
 * each entry. Left and Right also move the caret, so put at most one text
 * input in a horizontal toolbar, as its last item. In a vertical toolbar,
 * Down and Up on a `Menu` or `Select` trigger open its popup as well as
 * moving the tab stop on.
 *
 * A disabled item cancels the clicks the consumer handles on it, and those of
 * a `Button` stacked outside the part. A component stacked inside, such as a
 * `Menu` trigger or a `Select`, handles clicks on its own layer: pass it
 * `disabled: toolbar.isDisabled(value)` too. A `ToggleGroup` reads the
 * toolbar's `disabled`, and not that of a group or an item.
 *
 * **Example** (A formatting toolbar)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Button, Toolbar } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const EditorMessage = UiSchema.TaggedEnum({ PressedBold: {}, PressedItalic: {} })
 *
 * const Editor = Component.define({
 *   name: "Editor",
 *   scoped: false,
 *   model: Schema.Null,
 *   message: EditorMessage,
 *   elements: Html
 * }).make({
 *   init: () => null,
 *   update: (model) => model,
 *   view: (_, h) =>
 *     Toolbar(h, {
 *       props: { items: [{ value: "bold" }, { value: "italic" }, { value: "help" }] },
 *       view: (toolbar) =>
 *         toolbar.root(h.div.class("toolbar").attr("aria-label", "Formatting")).children(
 *           Button(h, { element: toolbar.button({ element: h.button, value: "bold" }), onPress: EditorMessage.PressedBold() })
 *             .children("Bold"),
 *           Button(h, {
 *             element: toolbar.button({ element: h.button, value: "italic" }),
 *             onPress: EditorMessage.PressedItalic()
 *           }).children("Italic"),
 *           toolbar.separator(h.div),
 *           toolbar.link({ element: h.a.attr("href", "/help"), value: "help" }).children("Help")
 *         )
 *     })
 * })
 *
 * // The toolbar has one tab stop: the first item.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Editor, {}))
 * if (!/<div class="toolbar"[^>]* role="toolbar"/.test(html)) throw new Error("the root isn't a toolbar")
 * if (!/tabindex="0"[^>]*>Bold</.test(html) || !/tabindex="-1"[^>]*>Italic</.test(html)) {
 *   throw new Error("the first item doesn't hold the only tab stop")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { DirectionProvider } from "./DirectionProvider.ts"
import { type Attributed, flag, type Keyed, separatorAttrs } from "./internal/attributes.ts"
import { arrowKeys, stepped } from "./internal/list.ts"

/**
 * The direction a toolbar's items run in, which picks its arrow keys.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ToolbarOrientation = Schema.Literals(["horizontal", "vertical"])

/**
 * The direction a toolbar's items run in.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ToolbarOrientation = typeof ToolbarOrientation.Type

/**
 * One item of a toolbar: the `value` its part is drawn with, and its state.
 *
 * **Details**
 *
 * - `disabled`: the item is disabled.
 * - `focusableWhenDisabled`: a disabled item stays focusable and in the
 *   arrow keys' order. On by default.
 *
 * A link is never disabled, so leave both off a link's entry.
 * - `group`: the `value` of the entry in `groups` whose `group` part is drawn
 *   around the item, so a disabled group disables it.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ToolbarItem = Schema.Struct({
  value: Schema.String,
  disabled: Schema.optional(Schema.Boolean),
  focusableWhenDisabled: Schema.optional(Schema.Boolean),
  group: Schema.optional(Schema.String)
})

/**
 * One item of a toolbar.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ToolbarItem = typeof ToolbarItem.Type

/**
 * One group of a toolbar: the `value` its `group` part is drawn with, and
 * whether it disables the items inside.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ToolbarGroup = Schema.Struct({
  value: Schema.String,
  disabled: Schema.optional(Schema.Boolean)
})

/**
 * One group of a toolbar.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ToolbarGroup = typeof ToolbarGroup.Type

/**
 * Props for the state of a `Toolbar`.
 *
 * **Details**
 *
 * - `items`: every button, link and input, in the order they are drawn.
 *   Required.
 * - `groups`: every group drawn with the `group` part. None by default.
 * - `disabled`: disables every button and input.
 * - `orientation`: `"horizontal"` by default, which moves with Right and
 *   Left, or `"vertical"`, which moves with Down and Up.
 * - `loopFocus`: the arrow keys wrap from the last item to the first and
 *   back. On by default.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ToolbarProps = Schema.Struct({
  items: Schema.Array(ToolbarItem),
  groups: Schema.optional(Schema.Array(ToolbarGroup)),
  disabled: Schema.optional(Schema.Boolean),
  orientation: Schema.optional(ToolbarOrientation),
  loopFocus: Schema.optional(Schema.Boolean)
})

/**
 * The props of a `Toolbar`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ToolbarProps = typeof ToolbarProps.Type

const ToolbarMessage = UiSchema.TaggedEnum({
  FocusedItem: { value: Schema.String },
  PressedItemKey: { value: Schema.String, key: Schema.String },
  PressedInputKey: { value: Schema.String, key: Schema.String, caret: Schema.NullOr(Schema.Number) }
})

const ToolbarModel = Schema.Struct({ active: Schema.NullOr(Schema.String) })

type ToolbarModel = typeof ToolbarModel.Type

const Item = Html.ref("ToolbarItem", "button")

const textField = (element: globalThis.Element): boolean =>
  element.localName === "textarea" ||
  (element.localName === "input" && (element as HTMLInputElement).selectionStart != null)

const FocusItem = Command.make(
  "FocusItem",
  {
    args: {
      ref: Renderer.Ref,
      leaving: Schema.optional(Schema.Struct({ ref: Renderer.Ref, caret: Schema.Number }))
    }
  },
  ({ leaving, ref }) =>
    Renderer.Refs.use((refs) =>
      Effect.gen(function*() {
        if (leaving !== undefined) {
          const from = yield* refs.lookup(leaving.ref)
          if (Option.isSome(from) && (from.value as HTMLInputElement).value.length !== leaving.caret) return
        }
        const to = yield* refs.lookup(ref)
        if (Option.isNone(to)) return
        const element = to.value as globalThis.Element
        yield* Html.Host.useSync((host) => {
          host.focus(element, {})
          if (textField(element)) host.select(element)
        })
      })
    ).pipe(Effect.as(Component.noop))
)

const groupOf = (props: ToolbarProps, value: string): ToolbarGroup | undefined =>
  props.groups?.find((group) => group.value === value)

const disabledOf = (props: ToolbarProps, item: ToolbarItem): boolean =>
  props.disabled === true || item.disabled === true ||
  (item.group !== undefined && groupOf(props, item.group)?.disabled === true)

const reachable = (props: ToolbarProps, item: ToolbarItem): boolean =>
  item.focusableWhenDisabled !== false || !disabledOf(props, item)

const tabStopOf = (model: ToolbarModel, props: ToolbarProps): string | null => {
  const items = props.items.filter((item) => reachable(props, item))
  return (items.find((item) => item.value === model.active) ?? items[0])?.value ?? null
}

type ToolbarUpdate = Component.Update<ToolbarModel, typeof ToolbarMessage.Type, never, ToolbarProps> & {
  readonly shared: { readonly provider?: { readonly direction: "ltr" | "rtl" } | undefined }
}

const targetOf = (value: string, key: string, $: ToolbarUpdate): ToolbarItem | undefined => {
  const items = $.props.items.filter((item) => reachable($.props, item))
  const last = items.length - 1
  const { next, previous } = arrowKeys($.props.orientation ?? "horizontal", $.shared.provider?.direction === "rtl")
  if (key !== next && key !== previous && key !== "Home" && key !== "End") return undefined
  const target = items[
    key === "Home"
      ? 0
      : key === "End"
      ? last
      : stepped(
        items.findIndex((item) => item.value === value),
        last,
        key === next ? 1 : -1,
        $.props.loopFocus !== false ? "wrap" : "none"
      )
  ]
  return target === undefined || target.value === value ? undefined : target
}

/**
 * A headless toolbar. Call it with the consumer's `h`, the `props`, and a `view`
 * closure that draws the root with `toolbar.root(h.div)` and, inside it, one
 * `toolbar.button`, `toolbar.link` or `toolbar.input` for each item.
 *
 * **Details**
 *
 * The parts also return `disabled` and `orientation`, resolved, and
 * `isDisabled(value)`, whether an item is disabled by its entry, its group or
 * the toolbar.
 *
 * The toolbar's own attributes win over the ones the consumer set on the
 * builder before the part, including the ones a state leaves absent:
 *
 * - `root`: `role="toolbar"`, `aria-orientation`, `data-orientation` and
 *   `data-disabled`
 * - `group`: `role="group"`, `data-orientation` and `data-disabled`
 * - `button`: `type="button"`, `tabindex`, `disabled`, `aria-disabled`,
 *   `data-orientation`, `data-disabled` and `data-focusable`
 * - `input`: the same but `type`, and `readonly` while it is disabled and
 *   focusable, which keeps the consumer's otherwise
 * - `link`: `tabindex` and `data-orientation`
 * - `separator`: `role="separator"`, `aria-orientation` and
 *   `data-orientation`
 *
 * A part writes them when it is applied. A button or input writes
 * `disabled`, `aria-disabled` and `data-disabled` again on the finished
 * element, over a `Button` stacked outside it.
 *
 * Each item handles `focus` and `keydown` on a layer of its own, so the
 * consumer's handlers for them still run. A button or link cancels only the
 * keys it moves focus with, and an input none. A disabled, focusable button
 * cancels its clicks, and replaces a click handler set outside its layer.
 *
 * The toolbar shares `{ disabled, orientation }` with the components in its
 * `view` closure, which is how a `ToggleGroup` inside reads it. It reads the
 * nearest `DirectionProvider` above it, if there is one, and swaps Left and
 * Right in a right-to-left layout.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Toolbar = Component.define({
  name: "Toolbar",
  scoped: false,
  props: ToolbarProps,
  model: ToolbarModel,
  message: ToolbarMessage,
  restore: false,
  shares: {
    value: (_model, props) => ({
      disabled: props.disabled === true,
      orientation: props.orientation ?? "horizontal"
    }),
    schema: Schema.Struct({ disabled: Schema.Boolean, orientation: ToolbarOrientation })
  },
  shared: {
    provider: { owner: DirectionProvider, optional: true }
  },
  elements: Html
}).make({
  init: () => ({ active: null }),
  update: {
    FocusedItem: (model, { value }) => model.active === value ? model : { ...model, active: value },
    PressedItemKey: (model, { key, value }, $) => {
      const target = targetOf(value, key, $)
      if (target === undefined) return model
      return $.set({ ...model, active: target.value }).run(FocusItem.make({ ref: Item.at(target.value) }))
    },
    PressedInputKey: (model, { caret, key, value }, $) => {
      const target = targetOf(value, key, $)
      if (target === undefined) return model
      const { next } = arrowKeys($.props.orientation ?? "horizontal", $.shared.provider?.direction === "rtl")
      if (caret === null) {
        return $.set({ ...model, active: target.value }).run(FocusItem.make({ ref: Item.at(target.value) }))
      }
      if (key !== next) {
        return caret > 0 ? model : $.set({ ...model, active: target.value }).run(
          FocusItem.make({ ref: Item.at(target.value) })
        )
      }
      return $.run(FocusItem.make({ ref: Item.at(target.value), leaving: { ref: Item.at(value), caret } }))
    }
  },
  parts: (model, p) => {
    const props = p.props
    const disabled = props.disabled === true
    const orientation = props.orientation ?? "horizontal"
    const tabStop = tabStopOf(model, props)
    const axis = arrowKeys(orientation, false)
    const entries = new Map<string, ToolbarItem>()
    for (const item of props.items) {
      if (entries.has(item.value)) throw new Error("Toolbar: two items have the value " + JSON.stringify(item.value))
      if (item.group !== undefined && groupOf(props, item.group) === undefined) {
        throw new Error(
          "Toolbar: the item " + JSON.stringify(item.value) + " names the group " + JSON.stringify(item.group) +
            ", which isn't in groups"
        )
      }
      entries.set(item.value, item)
    }
    const entryOf = (value: string): ToolbarItem => {
      const entry = entries.get(value)
      if (entry === undefined) throw new Error("Toolbar: no item with value " + JSON.stringify(value) + " in items")
      return entry
    }
    const isDisabled = (value: string): boolean => disabledOf(props, entryOf(value))

    const itemAttrs = (value: string) => ({
      "data-orientation": orientation,
      tabindex: value === tabStop ? "0" : "-1"
    })

    const disabledAttrs = <N extends Attributed<N> & { readonly disabled: (disabled: boolean) => N }>(
      node: N,
      off: boolean,
      focusable: boolean
    ): N =>
      node.attrs({ "aria-disabled": off && focusable ? "true" : undefined, "data-disabled": flag(off) })
        .disabled(off && !focusable)

    const moves = ({ alt, ctrl, key, meta, shift }: Html.KeyPayload): boolean =>
      !alt && !ctrl && !meta && !shift &&
      (key === axis.next || key === axis.previous || key === "Home" || key === "End")

    const buttonPart = p.part("button", (b, value: string) => {
      const entry = entryOf(value)
      const off = disabledOf(props, entry)
      const focusable = entry.focusableWhenDisabled !== false
      const own = disabledAttrs(b.attrs(itemAttrs(value)), off, focusable)
        .attrs({ type: "button", "data-focusable": flag(focusable) })
        .ref(Item.at(value) as never)
        .onFocus(ToolbarMessage.FocusedItem({ value }))
        .onKeyDown((key) => moves(key) ? ToolbarMessage.PressedItemKey({ value, key: key.key }) : undefined, {
          preventDefault: true
        })
      if (!(off && focusable)) return own.forward((node) => disabledAttrs(node, off, focusable))
      return own
        .onClick(() => undefined, { preventDefault: "always" })
        .forward((node) => {
          const silenced = node.handlers.click === undefined
            ? node
            : node.onClick(() => undefined, { preventDefault: "always" })
          return disabledAttrs(silenced, off, focusable)
        })
    })

    const linkPart = p.part("a", (b, value: string) => {
      entryOf(value)
      return b.attrs(itemAttrs(value))
        .ref(Item.at(value) as never)
        .onFocus(ToolbarMessage.FocusedItem({ value }))
        .onKeyDown(
          (key) => moves(key) ? ToolbarMessage.PressedItemKey({ value, key: key.key }) : undefined,
          { preventDefault: true }
        )
    })

    const inputPart = p.part("input", (b, value: string) => {
      const entry = entryOf(value)
      const off = disabledOf(props, entry)
      const focusable = entry.focusableWhenDisabled !== false
      const own = disabledAttrs(b.attrs(itemAttrs(value)), off, focusable)
        .attr("data-focusable", flag(focusable))
        .ref(Item.at(value) as never)
        .onFocus(ToolbarMessage.FocusedItem({ value }))
        .onKeyDown(({ alt, composing, ctrl, key, meta, selectionEnd, selectionStart, shift }) =>
          alt || ctrl || meta || shift || composing || (key !== axis.next && key !== axis.previous) ||
            selectionStart !== selectionEnd
            ? undefined
            : ToolbarMessage.PressedInputKey({ value, key, caret: selectionEnd })
        )
      const readOnly = <N extends Attributed<N>>(node: N): N => off && focusable ? node.attr("readonly", "") : node
      return readOnly(own).forward((node) => readOnly(disabledAttrs(node, off, focusable)))
    })

    const options = <Tag extends string, R>(part: View.Part<Tag, [value: string], R>) =>
      View.wrapPart(
        part,
        <B extends Keyed<Tag>>({ element, value }: { readonly element: B; readonly value: string }): ReturnType<
          B["attr"]
        > => part(element.key(value), value) as ReturnType<B["attr"]>
      )

    const groupPart = p.part("div", (b, value: string) => {
      const group = groupOf(props, value)
      if (group === undefined) throw new Error("Toolbar: no group with value " + JSON.stringify(value) + " in groups")
      return b.attrs({
        role: "group",
        "data-orientation": orientation,
        "data-disabled": flag(disabled || group.disabled === true)
      })
    })

    return {
      disabled,
      orientation,
      isDisabled,
      root: p.part("div", (b) =>
        b.attrs({
          role: "toolbar",
          "aria-orientation": orientation,
          "data-orientation": orientation,
          "data-disabled": flag(disabled)
        })),
      group: View.wrapPart(
        groupPart,
        <B extends View.PartTarget<"div">>(
          { element, value }: { readonly element: B; readonly value: string }
        ): ReturnType<B["attr"]> => groupPart(element, value)
      ),
      button: options(buttonPart),
      link: options(linkPart),
      input: options(inputPart),
      separator: p.part("div", (b) => separatorAttrs(b, orientation === "vertical" ? "horizontal" : "vertical"))
    }
  }
})
