/**
 * Shares one list of ticked values among the checkboxes inside it, and lets a
 * parent checkbox tick or untick all of them. Pass the ticked values as
 * `value` and store the list `Updated` reports.
 *
 * `CheckboxGroup` is a headless component: the checkboxes in its `view`
 * read the value from it and report their toggles to it, and it remembers
 * the selection a parent checkbox brings back.
 *
 * **Anatomy**
 *
 * | Part   | Element                       |
 * | :----- | :---------------------------- |
 * | `root` | any element, usually a `<div>` |
 *
 * The root takes the consumer's builder and returns it, so the consumer goes
 * on chaining and adds the checkboxes with `.children(...)`:
 * `group.root(h.div).children(...)`. It adds no markup.
 *
 * A `Checkbox` with a `value` prop inside the group is a member: it is
 * ticked while the group's `value` holds its value, and a click adds or
 * removes it. A `Checkbox` with `parent: true` is the group's parent, given
 * `allValues`: it is ticked while every value is, indeterminate while some
 * are, and points at the members with `aria-controls`.
 *
 * Name the group with `aria-labelledby` on the root, or draw it as a field's
 * group: `group.root(field.group(h.div))` with `field.legend` as the name and
 * `field.member` on each checkbox's root.
 *
 * **Data attributes**
 *
 * On `root`, present with an empty value or absent:
 *
 * - `data-disabled`
 *
 * **Keyboard**
 *
 * `CheckboxGroup` adds no key handler. Each checkbox keeps its own: Space
 * toggles it and Tab moves between them.
 *
 * **Parent checkbox**
 *
 * A click on the parent cycles through the selections. From a mix of ticked
 * and unticked members it ticks them all, from all it unticks them all, and
 * from none it brings back the last mix, or ticks them all when there was
 * none. A disabled member keeps its state throughout: a ticked one stays
 * ticked, and an unticked one stays unticked.
 *
 * **Forms**
 *
 * Each ticked member submits its `value` under its own `name`, or the
 * group's `name` when it has none. The parent submits nothing, and an
 * unticked member submits nothing.
 *
 * **Example** (Fruit with a parent checkbox)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Checkbox, CheckboxGroup } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const fruits = ["apple", "pear", "plum"]
 *
 * const BasketMessage = UiSchema.TaggedEnum({ ChangedFruits: { value: Schema.Array(Schema.String) } })
 *
 * const Basket = Component.define({
 *   name: "Basket",
 *   scoped: false,
 *   model: Schema.Struct({ fruits: Schema.Array(Schema.String) }),
 *   message: BasketMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ fruits: ["apple"] }),
 *   update: {
 *     ChangedFruits: (model, { value }) => ({ ...model, fruits: value })
 *   },
 *   view: (model, h) =>
 *     CheckboxGroup(h, {
 *       props: { value: model.fruits, allValues: fruits, name: "fruit" },
 *       onEmit: { Updated: ({ value }) => BasketMessage.ChangedFruits({ value }) },
 *       view: (group) =>
 *         group.root(h.div.class("fruits").attr("aria-label", "Fruit")).children(
 *           h.label.children(
 *             Checkbox(h, { props: { parent: true }, view: (checkbox) => checkbox.root(h.button) }),
 *             "All fruit"
 *           ),
 *           ...fruits.map((fruit) =>
 *             h.label.children(
 *               Checkbox(h, { key: fruit, props: { value: fruit }, view: (checkbox) => checkbox.root(h.button) }),
 *               fruit
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * // The root is a styled group, and the parent is mixed and points at the apple it controls.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Basket, {}))
 * if (!/<div class="fruits"[^>]* role="group"/.test(html)) throw new Error("the root isn't a styled group")
 * const controls = /aria-checked="mixed"[^>]* aria-controls="([^"]+)"/.exec(html)?.[1].split(" ") ?? []
 * const apple = /<button id="([^"]+)"[^>]*><input type="hidden" name="fruit" value="apple">/.exec(html)?.[1]
 * if (apple === undefined || !controls.includes(apple)) throw new Error("the mixed parent doesn't control the apple")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { flag } from "./internal/attributes.ts"
import { CheckboxGroupItem, CheckboxGroupMessage } from "./internal/checkboxGroup.ts"
import { toggled } from "./internal/formInputs.ts"

/**
 * Props for the value of a `CheckboxGroup` and the checkboxes it holds.
 *
 * **Details**
 *
 * - `value`: the values of the ticked members. Required: the consumer owns
 *   it.
 * - `allValues`: the values of every member, in order. Needed for a parent
 *   checkbox: without it a `parent` checkbox follows its own `checked`.
 * - `disabled`: disables every checkbox in the group and sets
 *   `data-disabled` on the root.
 * - `name`: the form name of each member that has no `name` of its own.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CheckboxGroupProps = Schema.Struct({
  value: Schema.Array(Schema.String),
  allValues: Schema.optional(Schema.Array(Schema.String)),
  disabled: Schema.optional(Schema.Boolean),
  name: Schema.optional(Schema.String)
})

/**
 * The props of a `CheckboxGroup`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CheckboxGroupProps = typeof CheckboxGroupProps.Type

/**
 * `Updated` reports the ticked values the user asked for, after a member or
 * the parent was clicked. Store them and pass them back as `value`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CheckboxGroupEvents = UiSchema.TaggedEnum({
  Updated: { value: Schema.Array(Schema.String) }
})

/**
 * What a `CheckboxGroup` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CheckboxGroupEvents = typeof CheckboxGroupEvents.Type

const Model = Schema.Struct({
  remembered: Schema.Array(Schema.String),
  items: Schema.Array(CheckboxGroupItem)
})

type Model = typeof Model.Type

const Shared = Schema.Struct({
  value: Schema.Array(Schema.String),
  disabled: Schema.Boolean,
  name: Schema.NullOr(Schema.String),
  parent: Schema.NullOr(Schema.Struct({
    checked: Schema.Boolean,
    indeterminate: Schema.Boolean,
    controls: Schema.String
  }))
})

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const parentOf = (model: Model, props: CheckboxGroupProps): typeof Shared.Type["parent"] => {
  const all = props.allValues
  if (all === undefined) return null
  const value = new Set(props.value)
  const ticked = all.filter((item) => value.has(item)).length
  return {
    checked: all.length > 0 && ticked === all.length,
    indeterminate: ticked > 0 && ticked < all.length,
    controls: all.flatMap((item) => model.items.filter((other) => other.value === item).map(({ id }) => id)).join(" ")
  }
}

// The parent's next selection. A disabled member keeps its state, so only
// the others count towards all, some or none.
const cycle = (model: Model, props: CheckboxGroupProps) => {
  const all = props.allValues ?? []
  const locked = new Set(model.items.filter((item) => item.disabled).map((item) => item.value))
  const free = all.filter((item) => !locked.has(item))
  if (free.length === 0) return undefined
  const ticked = new Set(props.value)
  const status = (values: ReadonlyArray<string>) => {
    const set = new Set(values)
    const count = free.filter((item) => set.has(item)).length
    return count === 0 ? "none" : count === free.length ? "all" : "some"
  }
  const keep = (values: ReadonlyArray<string>) => {
    const set = new Set(values)
    return all.filter((item) => (locked.has(item) ? ticked : set).has(item))
  }
  switch (status(props.value)) {
    case "all":
      return { value: keep([]), remembered: model.remembered }
    case "some":
      return { value: keep(all), remembered: props.value }
    case "none":
      return { value: keep(status(model.remembered) === "some" ? model.remembered : all), remembered: model.remembered }
  }
}

/**
 * A headless checkbox group. Call it with the consumer's `h`, the `props`,
 * and a `view` closure that draws the root with `group.root(h.div)` and the
 * checkboxes inside it.
 *
 * **Details**
 *
 * The parts also return `value` and `disabled`, for markup that depends on
 * them.
 *
 * The root writes `role="group"` and `data-disabled` over what the consumer
 * set on the builder before the part, including a `data-disabled` the state
 * leaves absent. An attribute the consumer chains after the part is the
 * consumer's to answer for.
 *
 * A click on a disabled group's checkboxes emits nothing.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const CheckboxGroup = Component.define({
  name: "CheckboxGroup",
  scoped: false,
  props: CheckboxGroupProps,
  model: Model,
  message: CheckboxGroupMessage,
  events: CheckboxGroupEvents,
  shares: {
    value: (model, props) => ({
      value: props.value,
      disabled: props.disabled === true,
      name: props.name ?? null,
      parent: parentOf(model, props)
    }),
    schema: Shared,
    receives: ["ToggledItem", "ToggledParent"],
    collects: {
      schema: Schema.NullOr(CheckboxGroupItem),
      onChange: (reports) =>
        CheckboxGroupMessage.ChangedItems({
          items: reports
            .filter((item) => item !== null)
            .sort((a, b) => compare(a.value, b.value) || compare(a.id, b.id))
        })
    }
  },
  elements: Html
}).make({
  init: ($) => ({ remembered: $.props.value, items: [] }),
  update: {
    ToggledItem: (model, { value }, $) => {
      const next = toggled($.props.value, value)
      return $.set({ ...model, remembered: next }).emit(CheckboxGroupEvents.Updated({ value: next }))
    },
    ToggledParent: (model, _message, $) => {
      const next = cycle(model, $.props)
      return next === undefined
        ? model
        : $.set({ ...model, remembered: next.remembered }).emit(CheckboxGroupEvents.Updated({ value: next.value }))
    },
    ChangedItems: (model, { items }) => ({ ...model, items })
  },
  parts: (_model, p) => {
    const disabled = p.props.disabled === true
    return {
      value: p.props.value,
      disabled,
      root: p.part((b) => b.attr("role", "group").attr("data-disabled", flag(disabled)))
    }
  }
})
