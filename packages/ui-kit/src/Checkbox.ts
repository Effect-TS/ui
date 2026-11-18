/**
 * A controlled checkbox. Pass the current value as `checked` and update
 * it when the checkbox emits `Toggled`. Your view supplies the markup;
 * the component adds ARIA and data attributes, handles user input and
 * supplies the form field.
 *
 * **Anatomy**
 *
 * | Part        | Element                  |
 * | :---------- | :----------------------- |
 * | `root`      | `<button role="checkbox">` |
 * | `indicator` | `<span>` inside the root |
 *
 * Each part takes the consumer's builder and returns it, so the consumer
 * goes on chaining and adds children with `.children(...)`:
 * `s.root(h.button).children(s.indicator(h.span))`. When the checkbox has
 * a form value to submit, `root` appends its hidden input after any
 * children already on the button and before children you chain afterward,
 * so the form value can't be left out. `indicator` adds no markup.
 *
 * A part's result is still a builder, so it can be another kit call's
 * `element`, and both share one element.
 *
 * Naming the checkbox is the consumer's job: a `<label>` around the root or
 * one pointing at its `id`, an `aria-label` or `aria-labelledby` on the
 * button, or text inside it.
 *
 * **Data attributes**
 *
 * On `root` and `indicator`, each present with an empty value or absent:
 *
 * - `data-checked` / `data-unchecked`, neither while indeterminate
 * - `data-indeterminate`
 * - `data-disabled`
 * - `data-readonly`
 * - `data-required`
 *
 * **Keyboard**
 *
 * The root is a native `<button>`, so the browser's defaults do the work:
 * Space toggles it and Tab moves focus. A click on a `<label>` that names
 * it toggles it too. Enter doesn't toggle it, as it doesn't toggle a
 * native checkbox: the root's `keydown` handler cancels Enter and leaves
 * every other key's default alone.
 *
 * That handler also means the root gets every `keydown` while it has
 * focus. A host gives an event only to the innermost element with a
 * handler for it, so an ancestor's `onKeyDown` never sees Escape or the
 * arrow keys pressed on the checkbox. To handle them, add `onKeyDown` to
 * the root's button, which runs after the checkbox's own.
 *
 * **Forms**
 *
 * Place the checkbox inside the form that should submit its value. A
 * `form` attribute on the button does not associate its hidden input
 * with that form. The `required` prop sets `aria-required` and
 * `data-required` but does not block submission when unchecked.
 *
 * **Indicator visibility**
 *
 * The indicator stays in the DOM whenever your view renders it. Hide it
 * with `[data-unchecked]` or render it only when `s.checked || s.indeterminate`.
 *
 * **Example** (A labelled checkbox whose value lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Checkbox } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const SignupMessage = Schema.TaggedUnion({ ToggledTerms: { checked: Schema.Boolean } })
 *
 * const Signup = Component.define({
 *   name: "Signup",
 *   model: Schema.Struct({ terms: Schema.Boolean }),
 *   message: SignupMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ terms: false }),
 *   update: (model, message) =>
 *     SignupMessage.match(message, {
 *       ToggledTerms: ({ checked }) => ({ ...model, terms: checked })
 *     }),
 *   view: (model, h) =>
 *     Checkbox(h, {
 *       props: { checked: model.terms, name: "terms", required: true },
 *       onEmit: ({ checked }) => SignupMessage.make({ _tag: "ToggledTerms", checked }),
 *       view: (s) =>
 *         h.label.class("terms").children(
 *           s.root(h.button.class("checkbox")).children(s.indicator(h.span.class("tick"))),
 *           "I accept the terms"
 *         )
 *     })
 * })
 *
 * // The root keeps the consumer's class and gets the checkbox's role.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Signup, {}))
 * if (!/<button class="checkbox"[^>]* role="checkbox"/.test(html)) throw new Error("the root isn't a styled checkbox")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Schema from "effect/Schema"
import { flag } from "./internal/attributes.ts"
import { field } from "./internal/field.ts"

/**
 * Props for controlling the checkbox state and the value it submits.
 *
 * **Details**
 *
 * - `checked`: whether the checkbox is ticked. Required: the consumer owns
 *   it.
 * - `indeterminate`: shows the checkbox as neither ticked nor unticked,
 *   with `aria-checked="mixed"`. It overrides `checked` in the ARIA and
 *   data attributes, but not in the form value. A click still emits the
 *   opposite of `checked`, so clear `indeterminate` when storing it.
 * - `disabled`: sets the native `disabled` attribute, so the checkbox is
 *   skipped by Tab and ignores clicks.
 * - `readOnly`: ignores clicks but stays focusable, and sets
 *   `aria-readonly`.
 * - `required`: sets `aria-required` and `data-required`.
 * - `name`, `value` and `uncheckedValue`: the form field. A ticked
 *   checkbox submits `value`, `"on"` by default. An unticked one submits
 *   `uncheckedValue`, or nothing when it is unset. A disabled checkbox, or
 *   one without a `name`, submits nothing.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CheckboxProps = Schema.Struct({
  checked: Schema.Boolean,
  indeterminate: Schema.optional(Schema.Boolean),
  disabled: Schema.optional(Schema.Boolean),
  readOnly: Schema.optional(Schema.Boolean),
  required: Schema.optional(Schema.Boolean),
  name: Schema.optional(Schema.String),
  value: Schema.optional(Schema.String),
  uncheckedValue: Schema.optional(Schema.String)
})

/**
 * The props of a `Checkbox`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CheckboxProps = typeof CheckboxProps.Type

/**
 * `Toggled` reports the requested value in `checked`. Store that value
 * and pass it back as the `checked` prop to update the checkbox.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CheckboxEvents = Schema.TaggedUnion({
  Toggled: { checked: Schema.Boolean }
})

/**
 * What a `Checkbox` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CheckboxEvents = typeof CheckboxEvents.Type

// A click on the root, which Space on the native button arrives as. Enter
// is its own message so the root can cancel the button's click on Enter.
const Message = Schema.TaggedUnion({ ClickedRoot: {}, PressedEnter: {} })

const interactive = (props: CheckboxProps): boolean => props.disabled !== true && props.readOnly !== true

// The state attributes, the same on the root and the indicator so either
// one can be styled on its own. An indeterminate checkbox is neither
// checked nor unchecked.
const state = <B extends { readonly attr: (name: string, value: string | undefined) => B }>(
  builder: B,
  props: CheckboxProps
): B => {
  const indeterminate = props.indeterminate === true
  return builder
    .attr("data-checked", flag(!indeterminate && props.checked))
    .attr("data-unchecked", flag(!indeterminate && !props.checked))
    .attr("data-indeterminate", flag(indeterminate))
    .attr("data-disabled", flag(props.disabled))
    .attr("data-readonly", flag(props.readOnly))
    .attr("data-required", flag(props.required))
}

/**
 * A headless checkbox. Call it with the consumer's `h`, the `props`, and a
 * `view` closure that draws the root with `s.root(h.button)`, usually with
 * `s.indicator(h.span)` as a child.
 *
 * **Details**
 *
 * The parts also return `checked`, `indeterminate`, `disabled`, `readOnly`
 * and `required`, resolved to booleans, for markup that depends on them.
 *
 * `root(button)` and `indicator(span)` each return the builder they were
 * given, so the consumer chains classes, attributes, handlers and children
 * on it. When the checkbox has a form value to submit, `root` appends its
 * hidden input after any children already on the button and before
 * children you chain afterward. A click on a disabled or read-only
 * checkbox emits nothing.
 * A handler the consumer adds to the root runs after the checkbox's own.
 *
 * The checkbox's own attributes win over the ones the consumer set on the
 * builder before the part: `type`, `role`, `disabled`, the ARIA state
 * (`aria-checked`, `aria-disabled`, `aria-readonly`, `aria-required`)
 * and the data attributes. That includes the ones a state leaves absent,
 * so a `disabled` on the consumer's button is removed unless the
 * `disabled` prop is set. A part writes them when it is applied, so an
 * attribute the consumer chains after `s.root(...)` or `s.indicator(...)`
 * is the consumer's to answer for.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Checkbox = Component.define({
  name: "Checkbox",
  props: CheckboxProps,
  model: Schema.Struct({}),
  message: Message,
  events: CheckboxEvents,
  elements: Html
}).make({
  init: () => ({}),
  update: (model, message, $) =>
    Message.match(message, {
      ClickedRoot: () =>
        interactive($.props)
          ? $.emit(CheckboxEvents.make({ _tag: "Toggled", checked: !$.props.checked }))
          : model,
      // Enter means nothing to a checkbox: the message only cancels it.
      PressedEnter: () => model
    }),
  parts: (_model, p) => {
    const indeterminate = p.props.indeterminate === true
    const hidden = field(p.props)
    return {
      checked: p.props.checked,
      indeterminate,
      disabled: p.props.disabled === true,
      readOnly: p.props.readOnly === true,
      required: p.props.required === true,
      root: p.part("button", (b) =>
        state(b, p.props)
          // Inside a form a button submits by default.
          .attr("type", "button")
          .attr("role", "checkbox")
          .attr("aria-checked", indeterminate ? "mixed" : String(p.props.checked))
          .attr("aria-readonly", p.props.readOnly === true ? "true" : undefined)
          .attr("aria-required", p.props.required === true ? "true" : undefined)
          // Never set: the native `disabled` reports it. Removed, so the
          // consumer's can't report a state the props don't have.
          .attr("aria-disabled", undefined)
          .disabled(p.props.disabled === true)
          .onClick(Message.make({ _tag: "ClickedRoot" }))
          .onKeyDown(
            ({ key }) => key === "Enter" ? Message.make({ _tag: "PressedEnter" }) : undefined,
            // Cancels Enter's click on the button, and leaves every other key alone.
            { preventDefault: true }
          )
          // The form field goes after the children already on the button, and
          // before the ones the consumer chains afterward.
          .children(hidden)),
      indicator: p.part("span", (b) => state(b, p.props))
    }
  }
})
