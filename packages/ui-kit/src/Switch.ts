/**
 * A control that turns a setting on or off, ported from Base UI's Switch
 * (https://base-ui.com/react/components/switch).
 *
 * `Switch` is headless: it owns the ARIA, the data attributes and the click
 * handling, and the consumer draws the markup. The consumer owns the value,
 * passes it as `checked`, and stores what the `CheckedChange` event
 * reports.
 *
 * **Anatomy**
 *
 * | Base UI        | Part     | Element                    |
 * | :------------- | :------- | :------------------------- |
 * | `Switch.Root`  | `root`   | `<button role="switch">`   |
 * | `Switch.Thumb` | `thumb`  | `<span>` inside the root   |
 * | hidden input   | `input`  | `<input type="hidden">`    |
 *
 * **Data attributes**
 *
 * On `root` and `thumb`, each present with an empty value or absent:
 *
 * - `data-checked` / `data-unchecked`
 * - `data-disabled`
 * - `data-readonly`
 * - `data-required`
 *
 * **Keyboard**
 *
 * The root is a native `<button>`, so Space and Enter toggle it and Tab
 * moves focus, without a key handler. A `<label>` around the root, or one
 * pointing at its `id`, names it and toggles it on click.
 *
 * **Differences from Base UI**
 *
 * - The value is always controlled. There is no `defaultChecked`: keep the
 *   value in the consumer's Model.
 * - The root is always a native `<button>`, Base UI's `nativeButton` mode.
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
 * const SettingsMessage = Schema.TaggedUnion({ SetNotify: { checked: Schema.Boolean } })
 *
 * const Settings = Component.define({
 *   name: "Settings",
 *   model: Schema.Struct({ notify: Schema.Boolean }),
 *   message: SettingsMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ notify: false }),
 *   update: (model, { checked }) => ({ ...model, notify: checked }),
 *   view: (model, h) =>
 *     Switch.Switch(h, {
 *       key: "notify",
 *       props: { checked: model.notify, name: "notify" },
 *       onEmit: ({ checked }) => SettingsMessage.make({ _tag: "SetNotify", checked }),
 *       view: (s) =>
 *         h.label.class("setting").children(
 *           s.root(h.button.class("switch")).children(s.thumb(h.span.class("thumb"))),
 *           s.input(h.input),
 *           "Notifications"
 *         )
 *     })
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
 * - `name`, `value` and `uncheckedValue`: the hidden input's form
 *   field. An on switch submits `value`, `"on"` by default. An off switch
 *   submits `uncheckedValue`, or nothing when it is unset.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Props = Schema.Struct({
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
export type Props = typeof Props.Type

/**
 * What a `Switch` emits. `CheckedChange` is Base UI's `onCheckedChange`:
 * the value the user asked for, which the consumer stores and passes back as
 * `checked`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Events = Schema.TaggedUnion({
  CheckedChange: { checked: Schema.Boolean }
})

/**
 * What a `Switch` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Events = typeof Events.Type

const Message = Schema.TaggedUnion({ Toggle: {} })

const interactive = (props: Props): boolean => props.disabled !== true && props.readOnly !== true

// A data attribute is present, with an empty value, or absent.
const flag = (on: boolean | undefined): string | undefined => on === true ? "" : undefined

// The state attributes, the same on the root and the thumb so either one
// can be styled on its own.
const state = <B extends { readonly attr: (name: string, value: string | undefined) => B }>(
  builder: B,
  props: Props
): B =>
  builder
    .attr("data-checked", flag(props.checked))
    .attr("data-unchecked", flag(!props.checked))
    .attr("data-disabled", flag(props.disabled))
    .attr("data-readonly", flag(props.readOnly))
    .attr("data-required", flag(props.required))

/**
 * A headless switch. Call it with the consumer's `h` and a `view` closure
 * that applies `root`, `thumb` and, inside a form, `input` to its own
 * builders.
 *
 * **Details**
 *
 * The parts also return `checked`, `disabled`, `readOnly` and
 * `required`, resolved to booleans, for markup that depends on them.
 *
 * A click on a disabled or read-only switch emits nothing. A handler the
 * consumer adds to the root runs after the switch's own.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Switch = Component.define({
  name: "Switch",
  props: Props,
  model: Schema.Struct({}),
  message: Message,
  events: Events,
  elements: Html
}).make({
  init: () => ({}),
  update: (model, _message, $) =>
    interactive($.props) ? $.emit(Events.make({ _tag: "CheckedChange", checked: !$.props.checked })) : model,
  parts: (_model, p) => ({
    checked: p.props.checked,
    disabled: p.props.disabled === true,
    readOnly: p.props.readOnly === true,
    required: p.props.required === true,
    root: p.part("button", (b) =>
      state(b, p.props)
        // Inside a form a button submits by default.
        .attr("type", "button")
        .attr("role", "switch")
        .attr("aria-checked", String(p.props.checked))
        .attr("aria-readonly", p.props.readOnly === true ? "true" : undefined)
        .attr("aria-required", p.props.required === true ? "true" : undefined)
        .disabled(p.props.disabled === true)
        .onClick(Message.make({ _tag: "Toggle" }))),
    thumb: p.part("span", (b) => state(b, p.props)),
    // A disabled input isn't submitted, which is how an off switch without
    // an `uncheckedValue` submits nothing, like a checkbox.
    input: p.part("input", (b) =>
      b.attr("type", "hidden")
        .attr("name", p.props.name)
        .attr("value", p.props.checked ? (p.props.value ?? "on") : p.props.uncheckedValue)
        .disabled(p.props.disabled === true || (!p.props.checked && p.props.uncheckedValue === undefined)))
  })
})
