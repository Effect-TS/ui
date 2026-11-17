/**
 * A control that turns a setting on or off, ported from Base UI's Switch
 * (https://base-ui.com/react/components/switch).
 *
 * `Switch` draws its own unstyled markup and takes its visible name from the
 * parent in the `label` slot. The consumer owns the value, passes it as
 * `checked`, and stores what the `Toggled` event reports.
 *
 * **Anatomy**
 *
 * | Base UI        | Element                                  | `data-part` |
 * | :------------- | :--------------------------------------- | :---------- |
 * | -              | `<label>` around the rest                | `label`     |
 * | `Switch.Root`  | `<button type="button" role="switch">`   | `root`      |
 * | `Switch.Thumb` | `<span>` inside the root                 | `thumb`     |
 * | -              | `<input type="hidden">`, the form field  |             |
 * | -              | the `label` slot, after the root and field |             |
 *
 * The `<label>` names the switch with the slot's content, and a click on
 * that content toggles it. Pass text or phrasing markup in the slot, and no
 * other control, as a `<label>` labels only its first control. The switch
 * draws the form field itself, so a switch with a `name` always submits.
 *
 * A switch without the `label` slot takes its name from the root's
 * attributes instead: `attributes: { root: { "aria-label": "Mute" } }` for
 * an icon-only switch, `"aria-labelledby"` for one named by a heading or a
 * table header, or an `id` for a `<label for>` elsewhere.
 *
 * **Styling**
 *
 * The switch sets no classes. Pass classes, styles and other attributes
 * for each element in `attributes`, by its `data-part`:
 * `attributes: { root: { class: "..." }, thumb: { class: "..." } }`. Each
 * element also has `data-scope="switch"`, its `data-part` and the state
 * attributes below, so a stylesheet can select
 * `[data-scope="switch"][data-part="thumb"][data-checked]`. The tags and
 * nesting may change. The slot comes after the root, so a row with the text
 * first reverses the label's flex direction.
 *
 * Names in `attributes` are HTML attribute names (`class`, not
 * `className`), compared without case. The switch's own attributes win over
 * the consumer's: `data-scope`, `data-part` and the state attributes on
 * every element, the label's `for`, and the root's `type`, `role`,
 * `aria-checked`, `aria-readonly`, `aria-required`, `aria-disabled` and
 * `disabled`. `on*` attributes, and names with whitespace, quotes, `=`,
 * `<`, `>` or `/`, are dropped.
 *
 * **Data attributes**
 *
 * On the label, the root and the thumb, each present with an empty value or
 * absent:
 *
 * - `data-checked` / `data-unchecked`
 * - `data-disabled`
 * - `data-readonly`
 * - `data-required`
 *
 * **Keyboard**
 *
 * The root is a native `<button>`, so Space and Enter toggle it and Tab
 * moves focus, without a key handler.
 *
 * **Differences from Base UI**
 *
 * - The value is always controlled. There is no `defaultChecked`: keep the
 *   value in the consumer's Model.
 * - The root is always a native `<button>`, Base UI's `nativeButton` mode,
 *   inside a `<label>` the switch draws. In place of `className`,
 *   `style` and `render`, `attributes` takes strings for each element:
 *   no state functions and no handlers.
 * - The form value is a hidden input, so `required` sets `aria-required`
 *   and `data-required` but doesn't block a form submission.
 * - Field state (`data-valid`, `data-invalid`, `data-dirty`,
 *   `data-touched`, `data-filled`, `data-focused`) waits for a ui-kit
 *   Field.
 *
 * **Example** (A labelled switch whose value lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Switch } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const SettingsMessage = Schema.TaggedUnion({ ToggledNotify: { checked: Schema.Boolean } })
 *
 * const Settings = Component.define({
 *   name: "Settings",
 *   model: Schema.Struct({ notify: Schema.Boolean }),
 *   message: SettingsMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ notify: false }),
 *   update: (model, message) =>
 *     SettingsMessage.match(message, {
 *       ToggledNotify: ({ checked }) => ({ ...model, notify: checked })
 *     }),
 *   view: (model, h) =>
 *     h.div.class("setting").children(
 *       Switch(h, {
 *         key: "notify",
 *         props: {
 *           checked: model.notify,
 *           name: "notify",
 *           attributes: {
 *             root: { class: "h-5 w-9 rounded-full bg-gray-300 data-[checked]:bg-blue-600" },
 *             thumb: { class: "block size-4 rounded-full bg-white data-[checked]:translate-x-4" }
 *           }
 *         },
 *         onEmit: ({ checked }) => SettingsMessage.make({ _tag: "ToggledNotify", checked }),
 *         slots: { label: "Notifications" }
 *       })
 *     )
 * })
 *
 * // The classes land on the elements the switch draws.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Settings, {}))
 * if (!html.includes('<span class="block size-4')) throw new Error("the thumb has no class")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Schema from "effect/Schema"
import { Attributes, withAttributes } from "./internal/attributes.ts"

/**
 * The props of a `Switch`, Base UI's Root props without the React ones.
 *
 * **Details**
 *
 * - `checked`: whether the switch is on. Required: the consumer owns it.
 * - `disabled`: sets the native `disabled` attribute, so the switch is
 *   skipped by Tab and ignores clicks.
 * - `readOnly`: ignores clicks but stays focusable, and sets
 *   `aria-readonly`.
 * - `required`: sets `aria-required` and `data-required`.
 * - `attributes`: the consumer's attributes for the `label`, `root` and
 *   `thumb` elements, by HTML name, such as `class`, `style`, `id` or
 *   `aria-label`. The switch's own attributes win over them.
 * - `name`, `value` and `uncheckedValue`: the form field. An on switch
 *   submits `value`, `"on"` by default. An off switch submits
 *   `uncheckedValue`, or nothing when it is unset. A disabled switch, or
 *   one without a `name`, submits nothing.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SwitchProps = Schema.Struct({
  checked: Schema.Boolean,
  disabled: Schema.optional(Schema.Boolean),
  readOnly: Schema.optional(Schema.Boolean),
  required: Schema.optional(Schema.Boolean),
  name: Schema.optional(Schema.String),
  value: Schema.optional(Schema.String),
  uncheckedValue: Schema.optional(Schema.String),
  attributes: Schema.optional(Schema.Struct({
    label: Schema.optional(Attributes),
    root: Schema.optional(Attributes),
    thumb: Schema.optional(Attributes)
  }))
})

/**
 * The props of a `Switch`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SwitchProps = typeof SwitchProps.Type

/**
 * What a `Switch` emits. `Toggled` is Base UI's `onCheckedChange`: the
 * user toggled the switch, and `checked` is the value they asked for, which
 * the consumer stores and passes back.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SwitchEvents = Schema.TaggedUnion({
  Toggled: { checked: Schema.Boolean }
})

/**
 * What a `Switch` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SwitchEvents = typeof SwitchEvents.Type

// A click on the root. Space and Enter on the native button, and a click on
// the label, arrive as one.
const Message = Schema.TaggedUnion({ ClickedRoot: {} })

const interactive = (props: SwitchProps): boolean => props.disabled !== true && props.readOnly !== true

// A data attribute is present, with an empty value, or absent.
const flag = (on: boolean | undefined): string | undefined => on === true ? "" : undefined

// What the switch writes on one element, over the consumer's attributes
// for it: the part's name and the state attributes, the same on every
// element so each can be styled on its own, and `own`.
const draw = <B extends { readonly attr: (name: string, value: string | undefined) => any }>(
  builder: B,
  part: "label" | "root" | "thumb",
  props: SwitchProps,
  own?: Readonly<Record<string, string | undefined>>
): ReturnType<B["attr"]> =>
  withAttributes(builder, props.attributes?.[part], {
    "data-scope": "switch",
    "data-part": part,
    "data-checked": flag(props.checked),
    "data-unchecked": flag(!props.checked),
    "data-disabled": flag(props.disabled),
    "data-readonly": flag(props.readOnly),
    "data-required": flag(props.required),
    ...own
  })

// What the form submits for these props, or nothing, like a checkbox: an off
// switch without an `uncheckedValue` and a disabled one submit nothing.
const submitted = (props: SwitchProps): string | undefined =>
  props.name === undefined || props.disabled === true
    ? undefined
    : props.checked
    ? (props.value ?? "on")
    : props.uncheckedValue

/**
 * A switch. Call it with the consumer's `h`, and pass its visible name in
 * the `label` slot, or an `aria-label` in `attributes.root`.
 *
 * **Details**
 *
 * The `label` slot's content is the consumer's: text, or markup with the
 * consumer's own handlers. A click on a disabled or read-only switch emits
 * nothing.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Switch = Component.define({
  name: "Switch",
  props: SwitchProps,
  model: Schema.Struct({}),
  message: Message,
  events: SwitchEvents,
  elements: Html,
  slots: ["label"]
}).make({
  init: () => ({}),
  update: (model, message, $) =>
    Message.match(message, {
      ClickedRoot: () =>
        interactive($.props)
          ? $.emit(SwitchEvents.make({ _tag: "Toggled", checked: !$.props.checked }))
          : model
    }),
  view: (_model, h) => {
    const value = submitted(h.props)
    // A `for` would point the label at another control.
    return draw(h.label, "label", h.props, { for: undefined }).children(
      draw(h.button, "root", h.props, {
        // Inside a form a button submits by default.
        type: "button",
        role: "switch",
        "aria-checked": String(h.props.checked),
        "aria-readonly": h.props.readOnly === true ? "true" : undefined,
        "aria-required": h.props.required === true ? "true" : undefined,
        // The native `disabled` reports it, and the switch decides it.
        "aria-disabled": undefined,
        disabled: flag(h.props.disabled)
      })
        .onClick(Message.make({ _tag: "ClickedRoot" }))
        .children(draw(h.span, "thumb", h.props)),
      value !== undefined && h.input.attr("type", "hidden").attr("name", h.props.name).attr("value", value),
      h.slots.label
    )
  }
})
