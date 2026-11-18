/**
 * A control that turns a setting on or off, ported from Base UI's Switch
 * (https://base-ui.com/react/components/switch).
 *
 * `Switch` is a view function. It keeps no state, so it takes no `key`: it
 * owns the ARIA, the data attributes, the form field and the click
 * handling, and the consumer draws the markup in `view`. The consumer owns
 * the value, passes it as `checked`, and stores what `onToggle` reports.
 *
 * **Anatomy**
 *
 * | Base UI        | Part    | Element                                         |
 * | :------------- | :------ | :---------------------------------------------- |
 * | `Switch.Root`  | `root`  | `<button role="switch">`, with the hidden input |
 * | `Switch.Thumb` | `thumb` | `<span>` inside the root                        |
 *
 * `root` takes the button and its children as `{ element, children }`
 * and returns the finished button. It adds the hidden `<input>` that
 * carries the form value as the last child, so a switch with a `name`
 * can't be drawn without it. `thumb` takes `{ element, children }` too.
 * Applied to the `<span>` alone, `s.thumb(h.span)`, it returns the builder
 * for another kit call's `element`.
 *
 * Naming the switch is the consumer's job: a `<label>` around the root or
 * one pointing at its `id`, an `aria-label` or `aria-labelledby` on the
 * button, or text inside it.
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
 *     Switch(h, {
 *       props: { checked: model.notify, name: "notify" },
 *       onToggle: ({ checked }) => SettingsMessage.make({ _tag: "ToggledNotify", checked }),
 *       view: (s) =>
 *         h.label.class("setting").children(
 *           s.root({
 *             element: h.button.class("switch"),
 *             children: [s.thumb({ element: h.span.class("thumb") })]
 *           }),
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
import * as View from "@effect/ui/View"
import { flag } from "./internal/attributes.ts"
import { field } from "./internal/field.ts"

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
 * `root` returns the finished button: set its classes, attributes and
 * other handlers on `element`, and pass what goes inside as `children`.
 * The root owns `click`, so an `element` that already handles it fails
 * the render: pass `onToggle` to the switch instead.
 *
 * `thumb` returns the finished span, or, applied to the span alone, the
 * builder for another kit call's `element`.
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
  readonly root: <R = never, const C extends ReadonlyArray<View.Input<Msg, any>> = readonly []>(
    options: {
      /** The consumer's `h.button`, with its classes, attributes and handlers. */
      readonly element: SwitchButton<Msg, R>
      /** What goes inside the button, usually the thumb. */
      readonly children?: C | undefined
    }
  ) => View.Element<Msg, R | View.Requirements<C[number]>>
  readonly thumb: {
    <R = never, const C extends ReadonlyArray<View.Input<Msg, any>> = readonly []>(
      options: {
        /** The consumer's `h.span`, with its classes and attributes. */
        readonly element: SwitchSpan<Msg, R>
        /** What goes inside the span. */
        readonly children?: C | undefined
      }
    ): View.Element<Msg, R | View.Requirements<C[number]>>
    <R = never>(element: SwitchSpan<Msg, R>): SwitchSpan<Msg, R>
  }
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
 * closure that draws the root with
 * `s.root({ element: h.button, children })`, usually with
 * `s.thumb({ element: h.span })` as a child. It returns what `view`
 * returns.
 *
 * **Details**
 *
 * `onToggle` is what a click sends: it gets the value the user asked for,
 * which the consumer stores and passes back as `checked`. It never
 * cancels the click. A disabled or read-only switch, or one without
 * `onToggle`, sets no click handler, so a click reaches an ancestor's.
 *
 * The switch's own attributes win over the ones the consumer set on the
 * builders it passes in: `type`, `role`, `disabled`, the ARIA state
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
  // Both of the thumb's forms: `SwitchParts` types each one's result.
  const thumb = (
    input: SwitchSpan<Msg, any> | {
      readonly element: SwitchSpan<Msg, any>
      readonly children?: ReadonlyArray<View.Input<Msg, any>> | undefined
    }
  ): any =>
    input instanceof View.ElementBuilder
      ? state(input, props)
      : state(input.element, props).children(...(input.children ?? []))
  return options.view({
    checked: props.checked,
    disabled: props.disabled === true,
    readOnly: props.readOnly === true,
    required: props.required === true,
    root: ({ children, element }) => {
      if (element.handlers.click !== undefined) {
        throw new Error("Switch: the root's element already handles click. The switch owns it: pass onToggle instead")
      }
      const root = state(element, props)
        // Inside a form a button submits by default.
        .attr("type", "button")
        .attr("role", "switch")
        .attr("aria-checked", String(props.checked))
        .attr("aria-readonly", props.readOnly === true ? "true" : undefined)
        .attr("aria-required", props.required === true ? "true" : undefined)
        // Never set: the native `disabled` reports it.
        .attr("aria-disabled", undefined)
        .disabled(props.disabled === true)
      return (interactive && onToggle !== undefined
        ? root.onClick(() => onToggle({ checked: !props.checked }))
        : root)
        .children(...(children ?? []), hidden)
    },
    thumb
  })
}
