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
 * | Base UI        | Element                                    |
 * | :------------- | :----------------------------------------- |
 * | -              | `<label>` around the rest                  |
 * | `Switch.Root`  | `<button type="button" role="switch">`     |
 * | `Switch.Thumb` | `<span>` inside the root                   |
 * | -              | `<input type="hidden">`, the form field    |
 * | -              | the `label` slot, after the root and field |
 *
 * The `<label>` names the switch with the slot's content, and a click on
 * that content toggles it. Pass text or phrasing markup in the slot, and no
 * other control, as a `<label>` labels only its first control. The switch
 * draws the form field itself, so a switch with a `name` always submits.
 *
 * **Styling**
 *
 * The switch sets no classes. Select the root as `[role="switch"]` and the
 * thumb as `[role="switch"] > span`, and style each state with its data
 * attributes, inside a class of the consumer's own around the switch.
 *
 * **Data attributes**
 *
 * On the root and the thumb, each present with an empty value or absent:
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
 *   inside a `<label>` the switch draws. A sibling `<label for>` and
 *   `render` aren't supported.
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
 * import { Html } from "@effect/ui/html"
 * import { Switch } from "@effect/ui-kit"
 * import { Schema } from "effect"
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
 *         props: { checked: model.notify, name: "notify" },
 *         onEmit: ({ checked }) => SettingsMessage.make({ _tag: "ToggledNotify", checked }),
 *         slots: { label: "Notifications" }
 *       })
 *     )
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Schema from "effect/Schema"

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
  uncheckedValue: Schema.optional(Schema.String)
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

// The state attributes, the same on the root and the thumb so either one
// can be styled on its own.
// A root builder such as `h.button` is callable, and `attr` returns its
// chain type, so this returns that.
const state = <B extends { readonly attr: (name: string, value: string | undefined) => any }>(
  builder: B,
  props: SwitchProps
): ReturnType<B["attr"]> =>
  builder
    .attr("data-checked", flag(props.checked))
    .attr("data-unchecked", flag(!props.checked))
    .attr("data-disabled", flag(props.disabled))
    .attr("data-readonly", flag(props.readOnly))
    .attr("data-required", flag(props.required))

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
 * the `label` slot.
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
    return h.label(
      state(h.button, h.props)
        // Inside a form a button submits by default.
        .attr("type", "button")
        .attr("role", "switch")
        .attr("aria-checked", String(h.props.checked))
        .attr("aria-readonly", h.props.readOnly === true ? "true" : undefined)
        .attr("aria-required", h.props.required === true ? "true" : undefined)
        .disabled(h.props.disabled === true)
        .onClick(Message.make({ _tag: "ClickedRoot" }))
        .children(state(h.span, h.props)),
      value !== undefined && h.input.attr("type", "hidden").attr("name", h.props.name).attr("value", value),
      h.slots.label
    )
  }
})
