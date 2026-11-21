/**
 * A control that turns a setting on or off.
 *
 * `Switch` is a view function. It keeps no state, so it takes no `key`: it
 * owns the ARIA, the data attributes, the form field and the click
 * handling, and the consumer draws the markup in `view`. The consumer owns
 * the value, passes it as `checked`, and stores what `onToggle` reports.
 *
 * **Anatomy**
 *
 * | Part    | Element                                         |
 * | :------ | :---------------------------------------------- |
 * | `root`  | `<button role="switch">`, with the hidden input |
 * | `thumb` | `<span>` inside the root                        |
 *
 * Each part takes the consumer's builder and returns it, so the consumer
 * goes on chaining: `parts.root(h.button.class("switch")).children(...)`.
 * `root` adds the hidden `<input>` that carries the form value as the
 * button's first child, before the consumer's children, so a switch with a
 * `name` can't be drawn without it. A part's result is also another kit
 * call's `element`.
 *
 * Naming the switch is the consumer's job: a `<label>` around the root or
 * one pointing at its `id`, an `aria-label` or `aria-labelledby` on the
 * button, or text inside it. A `Field` does it, and adds a description,
 * an error and the validity state: draw the root on its control,
 * `parts.root(field.control(h.button))`. A disabled field disables the button, but
 * the switch's other parts follow the `disabled` prop, so pass
 * `disabled: field.disabled` as well.
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
 * moves focus, without a key handler. A click on a `<label>` that names
 * it toggles it too.
 *
 * **Form behavior**
 *
 * The form value is a hidden input inside the root. The `required` prop
 * sets `aria-required` and `data-required` but does not block submission.
 *
 * **Example** (A labelled switch whose value lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Switch } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const SettingsMessage = UiSchema.TaggedEnum({ ToggledNotify: { checked: Schema.Boolean } })
 *
 * const Settings = Component.define({
 *   name: "Settings",
 *   model: Schema.Struct({ notify: Schema.Boolean }),
 *   message: SettingsMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ notify: false }),
 *   update: {
 *     ToggledNotify: (model, { checked }) => ({ ...model, notify: checked })
 *   },
 *   view: (model, h) =>
 *     Switch(h, {
 *       props: { checked: model.notify, name: "notify" },
 *       onToggle: ({ checked }) => SettingsMessage.ToggledNotify({ checked }),
 *       view: (parts) =>
 *         h.label.class("setting").children(
 *           parts.root(h.button.class("switch")).children(parts.thumb(h.span.class("thumb"))),
 *           "Notifications"
 *         )
 *     })
 * })
 *
 * // The root keeps the consumer's class and gets the switch's role.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Settings, {}))
 * if (!/<button class="switch"[^>]* role="switch"/.test(html)) throw new Error("the root isn't a styled switch")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Html from "@effect/ui/html/Html"
import type * as View from "@effect/ui/View"

import { flag } from "./internal/attributes.ts"
import { field } from "./internal/field.ts"

/**
 * The controlled value, interaction state and form settings for `Switch`.
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
 * @category models
 * @since 0.1.0
 */
export interface SwitchProps {
  readonly checked: boolean
  readonly disabled?: boolean | undefined
  readonly readOnly?: boolean | undefined
  readonly required?: boolean | undefined
  readonly name?: string | undefined
  readonly value?: string | undefined
  readonly uncheckedValue?: string | undefined
}

/**
 * A button the switch's root accepts, from the consumer's `h.button`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SwitchButton<Msg, R = never> = Html.Element<Msg, R, Html.EventsOf<"button">, HTMLButtonElement, "button">

/**
 * A span the switch's thumb accepts, from the consumer's `h.span`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SwitchSpan<Msg, R = never> = Html.Element<Msg, R, Html.EventsOf<"span">, HTMLSpanElement, "span">

/**
 * What a `Switch` gives its `view`: the parts, and the state resolved to
 * booleans for markup that depends on it.
 *
 * **Details**
 *
 * `root(button)` and `thumb(span)` each return the builder they were
 * given, so set its classes, attributes, other handlers and children
 * before the part or after it. The switch writes its own attributes when
 * the element is built, so they win over the consumer's either way.
 *
 * A switch with an `onToggle` sets the button's click handler, so a root
 * that handles `click` itself fails the render, in every state, whether
 * the handler was set before the part or chained after it. Without
 * `onToggle` the switch sets none, and the consumer's click handler stays.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface SwitchParts<Msg> {
  readonly checked: boolean
  readonly disabled: boolean
  readonly readOnly: boolean
  readonly required: boolean
  /** The consumer's `h.button`. The form field is its first child. */
  readonly root: <R = never>(element: SwitchButton<Msg, R>) => SwitchButton<Msg, R>
  /** The consumer's `h.span`, usually a child of the root. */
  readonly thumb: <R = never>(element: SwitchSpan<Msg, R>) => SwitchSpan<Msg, R>
}

// The state attributes, the same on the root and the thumb so either one
// can be styled on its own. Each is written in every state, as `undefined`
// removes what the consumer set.
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

/**
 * A switch. Call it with the consumer's `h`, the `props`, and a `view`
 * closure that draws the root with `parts.root(h.button)`, usually with
 * `parts.thumb(h.span.class("thumb"))` as a child. It returns what `view`
 * returns.
 *
 * **Details**
 *
 * `onToggle` is what a click sends: it gets the value the user asked for,
 * which the consumer stores and passes back as `checked`. It never
 * cancels the click. A read-only switch, or one without `onToggle`, sets
 * no click handler, so its click goes to the nearest ancestor that handles
 * one. A disabled switch sets none either, and the browser gives a
 * disabled button no click.
 *
 * The switch's own attributes win over the ones the consumer set on the
 * builders, before the part or after it: `type`, `role`, `disabled`, the ARIA state
 * (`aria-checked`, `aria-disabled`, `aria-readonly`, `aria-required`)
 * and the data attributes. That includes the ones a state leaves absent,
 * so a `disabled` on the consumer's button is removed unless the
 * `disabled` prop is set.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Switch = <Msg, A extends View.Content<Msg, any>>(
  _h: View.Helper<Msg, unknown>,
  options: {
    readonly props: SwitchProps
    /** The message a click sends, from the value the user asked for. */
    readonly onToggle?: ((event: { readonly checked: boolean }) => NoInfer<Msg> | undefined) | undefined
    /** The switch's whole view, from its parts. */
    readonly view: (parts: SwitchParts<Msg>) => A
  }
): A => {
  const { onToggle, props } = options
  const interactive = props.disabled !== true && props.readOnly !== true
  const hidden = field(props)
  return options.view({
    checked: props.checked,
    disabled: props.disabled === true,
    readOnly: props.readOnly === true,
    required: props.required === true,
    root: (element) =>
      // The field goes in first, so the consumer's children come after it.
      // The attributes and the handler wait for the finished button: they
      // are written after whatever the consumer chains on the root.
      element.children(hidden).forward((node) => {
        // By `onToggle` alone, not by the state: a read-only switch sets no
        // handler now, but the clash would only show once it became editable.
        if (onToggle !== undefined && node.handlers.click !== undefined) {
          throw new Error(
            "Switch: the root already handles click, which onToggle would replace. Send the message from onToggle"
          )
        }
        const root = state(node, props)
          // Inside a form a button submits by default.
          .attr("type", "button")
          .attr("role", "switch")
          .attr("aria-checked", String(props.checked))
          .attr("aria-readonly", props.readOnly === true ? "true" : undefined)
          .attr("aria-required", props.required === true ? "true" : undefined)
          // Never set: the native `disabled` reports it.
          .attr("aria-disabled", undefined)
          .disabled(props.disabled === true)
        return interactive && onToggle !== undefined
          ? root.onClick(() => onToggle({ checked: !props.checked }))
          : root
      }),
    thumb: (element) => element.forward((node) => state(node, props))
  })
}
