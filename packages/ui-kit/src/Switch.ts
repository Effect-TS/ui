/**
 * A control that turns a setting on or off, ported from Base UI's Switch
 * (https://base-ui.com/react/components/switch).
 *
 * `Switch` is headless: it owns the ARIA, the data attributes, the form
 * field and the click handling, and the consumer draws the markup. The
 * consumer owns the value, passes it as `checked`, and stores what the
 * `Toggled` event reports.
 *
 * **Anatomy**
 *
 * | Base UI        | Part    | Element                                         |
 * | :------------- | :------ | :---------------------------------------------- |
 * | `Switch.Root`  | `root`  | `<button role="switch">`, with the hidden input |
 * | `Switch.Thumb` | `thumb` | `<span>` inside the root                        |
 *
 * `root` takes the button and its children, and adds the hidden
 * `<input>` that carries the form value as the last child, so a switch
 * with a `name` can't be drawn without it.
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
 * - The form value is a hidden input inside the root, so `required` sets
 *   `aria-required` and `data-required` but doesn't block a form
 *   submission.
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
 *     Switch(h, {
 *       key: "notify",
 *       props: { checked: model.notify, name: "notify" },
 *       onEmit: ({ checked }) => SettingsMessage.make({ _tag: "ToggledNotify", checked }),
 *       view: (s) =>
 *         h.label.class("setting").children(
 *           s.root(h.button.class("switch"), s.thumb(h.span.class("thumb"))),
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
import * as View from "@effect/ui/View"
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

// A click on the root. Space and Enter on the native button arrive as one.
const Message = Schema.TaggedUnion({ ClickedRoot: {} })

const interactive = (props: SwitchProps): boolean => props.disabled !== true && props.readOnly !== true

// A data attribute is present, with an empty value, or absent.
const flag = (on: boolean | undefined): string | undefined => on === true ? "" : undefined

// The state attributes, the same on the root and the thumb so either one
// can be styled on its own.
const state = <B extends { readonly attr: (name: string, value: string | undefined) => B }>(
  builder: B,
  props: SwitchProps
): B =>
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

// The hidden input inside the root. A hidden input isn't interactive
// content, so it may sit inside a <button>, and a form still submits it.
const field = (props: SwitchProps): View.Node<never> | undefined => {
  const value = submitted(props)
  return value === undefined
    ? undefined
    : View.toNode(
      new Html.VoidElement<never>("input")
        .attr("type", "hidden")
        .attr("name", props.name)
        .attr("value", value)
    )
}

/**
 * A button the switch's root accepts, from the consumer's `h.button`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SwitchButton<Msg, R> = Html.Element<Msg, R, Html.EventsOf<"button">, HTMLButtonElement, "button">

/**
 * A headless switch. Call it with the consumer's `h` and a `view` closure
 * that draws the root with `s.root(h.button, ...children)`, usually with
 * `s.thumb(h.span)` as a child.
 *
 * **Details**
 *
 * The parts also return `checked`, `disabled`, `readOnly` and
 * `required`, resolved to booleans, for markup that depends on them.
 *
 * `root` returns the finished element: set the button's classes and
 * handlers before passing it. A click on a disabled or read-only switch
 * emits nothing. A handler the consumer adds to the root runs after the
 * switch's own.
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
  elements: Html
}).make({
  init: () => ({}),
  update: (model, message, $) =>
    Message.match(message, {
      ClickedRoot: () =>
        interactive($.props)
          ? $.emit(SwitchEvents.make({ _tag: "Toggled", checked: !$.props.checked }))
          : model
    }),
  parts: (_model, p) => {
    const root = p.part("button", (b) =>
      state(b, p.props)
        // Inside a form a button submits by default.
        .attr("type", "button")
        .attr("role", "switch")
        .attr("aria-checked", String(p.props.checked))
        .attr("aria-readonly", p.props.readOnly === true ? "true" : undefined)
        .attr("aria-required", p.props.required === true ? "true" : undefined)
        .disabled(p.props.disabled === true)
        .onClick(Message.make({ _tag: "ClickedRoot" })))
    const hidden = field(p.props)
    return {
      checked: p.props.checked,
      disabled: p.props.disabled === true,
      readOnly: p.props.readOnly === true,
      required: p.props.required === true,
      root: <Msg, R, const C extends ReadonlyArray<View.Input<Msg, any>>>(
        button: SwitchButton<Msg, R>,
        ...children: C
      ): View.Element<Msg, R | View.Requirements<C[number]>> => root(button).children(...children, hidden),
      thumb: p.part("span", (b) => state(b, p.props))
    }
  }
})
