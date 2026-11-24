/**
 * A controlled checkbox. Pass the current value as `checked` and update
 * it when the checkbox emits `Toggled`. Your view supplies the markup;
 * the component adds ARIA and data attributes, handles user input and
 * supplies the form field.
 *
 * `Checkbox` is a headless component, although its Model is empty: it
 * reads an enclosing `CheckboxGroup` and reports its toggles to it, which
 * needs an instance.
 *
 * Inside a `CheckboxGroup`, a checkbox with a `value` is a member and one
 * with `parent: true` is the group's parent. The group ticks each from its
 * `value` prop, the list the consumer stores from the group's `Updated`
 * event. The group itself remembers only the mixed selection that its
 * parent checkbox brings back.
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
 * `checkbox.root(h.button).children(checkbox.indicator(h.span))`. When the checkbox has
 * a form value to submit, `root` appends its hidden input after any
 * children already on the button and before children you chain afterward,
 * so the form value can't be left out. `indicator` adds no markup.
 *
 * A part's result is still a builder, so it can be another kit call's
 * `element`, and both share one element.
 *
 * Naming the checkbox is the consumer's job: a `<label>` around the root or
 * one pointing at its `id`, an `aria-label` or `aria-labelledby` on the
 * button, or text inside it. A `Field` does it, and adds a description,
 * an error and the validity state: draw the root on its control,
 * `checkbox.root(field.control(h.button))`. A disabled field disables the button, but
 * the checkbox's other parts follow the `disabled` prop, so pass
 * `disabled: field.disabled` as well.
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
 * On `root` only:
 *
 * - `data-parent`: the group's parent checkbox
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
 * with `[data-unchecked]` or render it only when `checkbox.checked || checkbox.indeterminate`.
 *
 * **Example** (A labelled checkbox whose value lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Checkbox } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const SignupMessage = UiSchema.TaggedEnum({ ToggledTerms: { checked: Schema.Boolean } })
 *
 * const Signup = Component.define({
 *   name: "Signup",
 *   scoped: false,
 *   model: Schema.Struct({ terms: Schema.Boolean }),
 *   message: SignupMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ terms: false }),
 *   update: {
 *     ToggledTerms: ($, { checked }) => $.evolve({ terms: checked })
 *   },
 *   view: (h, model) =>
 *     Checkbox(h, {
 *       props: { checked: model.terms, name: "terms", required: true },
 *       onEmit: { Toggled: ({ checked }) => SignupMessage.ToggledTerms({ checked }) },
 *       view: (checkbox) =>
 *         h.label.class("terms").children(
 *           checkbox.root(h.button.class("checkbox")).children(checkbox.indicator(h.span.class("tick"))),
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
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { CheckboxGroup } from "./CheckboxGroup.ts"
import { type Attributed, flag } from "./internal/attributes.ts"
import { CheckboxGroupMessage } from "./internal/checkboxGroup.ts"
import { field } from "./internal/field.ts"

/**
 * Props for controlling the checkbox state and the value it submits.
 *
 * **Details**
 *
 * - `checked`: whether the checkbox is ticked. The consumer owns it, and
 *   left out it is unticked. Inside a `CheckboxGroup`, a member or the
 *   parent ignores it: the group decides.
 * - `indeterminate`: shows the checkbox as neither ticked nor unticked,
 *   with `aria-checked="mixed"`. It overrides `checked` in the ARIA and
 *   data attributes, but not in the form value. A click still emits the
 *   opposite of `checked`, so clear `indeterminate` when storing it. On a
 *   group's parent it adds to the group's own, for a member that is itself
 *   the parent of a nested group.
 * - `disabled`: sets the native `disabled` attribute, so the checkbox is
 *   skipped by Tab and ignores clicks. A disabled `CheckboxGroup` disables
 *   every checkbox inside it.
 * - `readOnly`: ignores clicks but stays focusable, and sets
 *   `aria-readonly`.
 * - `required`: sets `aria-required` and `data-required`.
 * - `name`, `value` and `uncheckedValue`: the form field. A ticked
 *   checkbox submits `value`, `"on"` by default. An unticked one submits
 *   `uncheckedValue`, or nothing when it is unset. A disabled checkbox, or
 *   one without a `name`, submits nothing. Inside a `CheckboxGroup`, `value`
 *   makes the checkbox a member, and a member without a `name` takes the
 *   group's. An unticked checkbox inside a group submits nothing, even
 *   with `uncheckedValue`.
 * - `parent`: makes the checkbox the parent of the `CheckboxGroup` around
 *   it. It submits nothing.
 * - `id`: the root's `id`, for a `<label for>` beside it. A member
 *   writes it, or a generated one when it is left out, and the group's parent
 *   lists it in `aria-controls`. Outside a group the root writes it only
 *   when it is set, so `field.control` keeps the one it writes.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CheckboxProps = Schema.Struct({
  checked: Schema.optional(Schema.Boolean),
  indeterminate: Schema.optional(Schema.Boolean),
  disabled: Schema.optional(Schema.Boolean),
  readOnly: Schema.optional(Schema.Boolean),
  required: Schema.optional(Schema.Boolean),
  name: Schema.optional(Schema.String),
  value: Schema.optional(Schema.String),
  uncheckedValue: Schema.optional(Schema.String),
  parent: Schema.optional(Schema.Boolean),
  id: Schema.optional(Schema.String)
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
 * `Toggled` asks for the value in `checked`. Store that value and pass it
 * back as the `checked` prop to update the checkbox. Inside a
 * `CheckboxGroup`, a member and the parent emit it too, and the group's
 * `Updated` carries the list to store.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CheckboxEvents = UiSchema.TaggedEnum({
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
const CheckboxMessage = UiSchema.TaggedEnum({
  ClickedRoot: {},
  PressedEnter: {}
})

type GroupShared = Component.Shared.Value<typeof CheckboxGroup>

const isMember = (
  props: CheckboxProps
): props is CheckboxProps & { readonly value: string } =>
  props.parent !== true && props.value !== undefined

const memberId = (props: CheckboxProps, id: (name: string) => string): string =>
  props.id ?? id("root")

const resolve = (props: CheckboxProps, group: GroupShared | undefined) => {
  const disabled = props.disabled === true || group?.disabled === true
  const own = {
    indeterminate: props.indeterminate === true,
    disabled,
    readOnly: props.readOnly === true,
    required: props.required === true
  }
  if (props.parent === true && group?.parent != null) {
    const { checked, controls, indeterminate } = group.parent
    return {
      ...own,
      role: "parent" as const,
      checked,
      indeterminate: own.indeterminate || indeterminate,
      controls: controls === "" ? undefined : controls,
      field: { checked, disabled }
    }
  }
  if (group !== undefined && isMember(props)) {
    const checked = group.value.includes(props.value)
    return {
      ...own,
      role: "member" as const,
      value: props.value,
      checked,
      controls: undefined,
      field: {
        checked,
        disabled,
        name: props.name ?? group.name ?? undefined,
        value: props.value
      }
    }
  }
  const checked = props.checked === true
  return {
    ...own,
    role: undefined,
    checked,
    controls: undefined,
    field: {
      checked,
      disabled,
      name: props.parent === true ? undefined : props.name,
      value: props.value,
      uncheckedValue: group === undefined ? props.uncheckedValue : undefined
    }
  }
}

type Resolved = ReturnType<typeof resolve>

const interactive = (resolved: Resolved): boolean =>
  !resolved.disabled && !resolved.readOnly

// The state attributes, the same on the root and the indicator so either
// one can be styled on its own. An indeterminate checkbox is neither
// checked nor unchecked.
const state = <B extends Attributed<B>>(
  builder: B,
  resolved: Resolved
): B =>
  builder.attrs({
    "data-checked": flag(!resolved.indeterminate && resolved.checked),
    "data-unchecked": flag(!resolved.indeterminate && !resolved.checked),
    "data-indeterminate": flag(resolved.indeterminate),
    "data-disabled": flag(resolved.disabled),
    "data-readonly": flag(resolved.readOnly),
    "data-required": flag(resolved.required)
  })

/**
 * A headless checkbox. Call it with the consumer's `h`, the `props`, and a
 * `view` closure that draws the root with `checkbox.root(h.button)`, usually with
 * `checkbox.indicator(h.span)` as a child.
 *
 * **Details**
 *
 * The parts also return `checked`, `indeterminate`, `disabled`, `readOnly`
 * and `required`, resolved to booleans, for markup that depends on them.
 * Inside a `CheckboxGroup` they are what the group decided.
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
 * attribute the consumer chains after `checkbox.root(...)` or `checkbox.indicator(...)`
 * is the consumer's to answer for. The root writes `id` as the `id` prop
 * says, and the group's parent adds the members' ids to the consumer's
 * `aria-controls`.
 *
 * The checkbox reads the nearest `CheckboxGroup` above it, if there is one.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Checkbox = Component.define({
  name: "Checkbox",
  scoped: false,
  props: CheckboxProps,
  model: Schema.Struct({}),
  message: CheckboxMessage,
  events: CheckboxEvents,
  shared: {
    group: {
      owner: CheckboxGroup,
      optional: true,
      report: (_model, props, id) =>
        isMember(props)
          ? {
            value: props.value,
            disabled: props.disabled === true,
            id: memberId(props, id)
          }
          : null
    }
  },
  elements: Html
}).make({
  init: () => ({}),
  update: {
    ClickedRoot: ($) => {
      const resolved = resolve($.props, $.shared.group)
      if (!interactive(resolved)) return $.model
      const toggled = $.emit(
        CheckboxEvents.Toggled({ checked: !resolved.checked })
      )
      switch (resolved.role) {
        case "member":
          return toggled.send(
            CheckboxGroup,
            CheckboxGroupMessage.ToggledItem({ value: resolved.value })
          )
        case "parent":
          return toggled.send(
            CheckboxGroup,
            CheckboxGroupMessage.ToggledParent()
          )
        default:
          return toggled
      }
    },
    // Enter means nothing to a checkbox: the message only cancels it.
    PressedEnter: ($) => $.model
  },
  parts: (p) => {
    const resolved = resolve(p.props, p.shared.group)
    const hidden = field(resolved.field)
    const id = resolved.role === "member" ? memberId(p.props, p.id) : p.props.id
    return {
      checked: resolved.checked,
      indeterminate: resolved.indeterminate,
      disabled: resolved.disabled,
      readOnly: resolved.readOnly,
      required: resolved.required,
      root: p.part(
        "button",
        (b) =>
          state(id === undefined ? b : b.attr("id", id), resolved)
            .attrs({
              // Inside a form a button submits by default.
              type: "button",
              role: "checkbox",
              "aria-checked": resolved.indeterminate
                ? "mixed"
                : String(resolved.checked),
              "aria-readonly": resolved.readOnly ? "true" : undefined,
              "aria-required": resolved.required ? "true" : undefined,
              // Never set: the native `disabled` reports it. Removed, so the
              // consumer's can't report a state the props don't have.
              "aria-disabled": undefined,
              "data-parent": flag(p.props.parent),
              "aria-controls": resolved.controls
            })
            .disabled(resolved.disabled)
            .onClick(CheckboxMessage.ClickedRoot())
            .onKeyDown(
              ({ key }) =>
                key === "Enter" ? CheckboxMessage.PressedEnter() : undefined,
              // Cancels Enter's click on the button, and leaves every other key alone.
              { preventDefault: true }
            )
            // The form field goes after the children already on the button, and
            // before the ones the consumer chains afterward.
            .children(hidden)
      ),
      indicator: p.part("span", (b) => state(b, resolved))
    }
  }
})
