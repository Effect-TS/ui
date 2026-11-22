/**
 * Groups several fields under one legend, such as a company field and a tax
 * id field under "Billing details", and disables all of them at once.
 *
 * `Fieldset` is a headless component: the legend needs an id for the
 * fieldset to point at, and the fields inside read whether the fieldset is
 * disabled. It keeps no state of its own, and emits nothing.
 *
 * Use a fieldset for several fields, each with its own label, validity and
 * error. One value with one error, such as a range slider, a checkbox group
 * or a radio group, is a single `Field` drawn with `field.group` and
 * `field.legend`.
 *
 * **Anatomy**
 *
 * | Part     | Element                        |
 * | :------- | :----------------------------- |
 * | `root`   | `<fieldset>`                   |
 * | `legend` | any element, usually a `<div>` |
 *
 * Each part takes the consumer's builder and returns it, so the consumer
 * goes on chaining and adds children with `.children(...)`:
 * `fieldset.root(h.fieldset).children(fieldset.legend(h.div).children("Billing details"), ...)`.
 * No part adds markup.
 *
 * The root's `aria-labelledby` always points at the legend's id, so draw
 * the legend. A fieldset with no legend needs no component:
 * `h.fieldset.disabled(...)` is enough.
 *
 * **Data attributes**
 *
 * On both parts, present with an empty value or absent:
 *
 * - `data-disabled`
 *
 * **Keyboard**
 *
 * `Fieldset` adds no key handler. Each control keeps its own keyboard.
 *
 * **Usage**
 *
 * A disabled fieldset writes the native `disabled` on the `<fieldset>`, and
 * the browser then disables every control inside it, including the hidden
 * input a checkbox or a switch keeps its form value in. So nothing inside
 * takes a press or focus, and the form submits none of it. The browser
 * leaves out one place: the controls inside a `<legend>` that is the
 * fieldset's first child.
 *
 * A `Field` inside reads the nearest fieldset, at any depth, and is
 * disabled while the fieldset is: `data-disabled` on its parts, its error
 * hidden and its focus dropped. Nothing is passed to it. A control hears of
 * the fieldset from its field, so a control's other parts still take
 * `disabled: field.disabled`, as in any field. A control drawn with no
 * field around it is disabled by the browser alone, and its own parts
 * don't show it: pass `disabled: fieldset.disabled` to it.
 *
 * A fieldset doesn't read the fieldset around it. Pass the outer one's
 * state to a nested fieldset, `props: { disabled: outer.disabled || locked }`.
 * Without it the browser still disables the controls of the inner one, but
 * its legend and its fields don't show it.
 *
 * **Example** (Two fields under one legend)
 *
 * ```ts import.meta.vitest
 * import { Component } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Field, Fieldset } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const Billing = Component.define({
 *   name: "Billing",
 *   scoped: false,
 *   model: Schema.Struct({ locked: Schema.Boolean }),
 *   message: Schema.Never,
 *   elements: Html
 * }).make({
 *   init: () => ({ locked: true }),
 *   update: (model) => model,
 *   view: (model, h) =>
 *     Fieldset(h, {
 *       props: { disabled: model.locked },
 *       view: (fieldset) =>
 *         fieldset.root(h.fieldset.class("billing")).children(
 *           fieldset.legend(h.div).children("Billing details"),
 *           ...["Company", "Tax ID"].map((name) =>
 *             Field(h, {
 *               key: name,
 *               view: (field) =>
 *                 field.root(h.div).children(field.label(h.label).children(name), field.control(h.input))
 *             })
 *           )
 *         )
 *     })
 * })
 *
 * // The fieldset is disabled and named by its legend, and each field's input is disabled.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Billing, {}))
 * const [, root, legendId] = /<fieldset class="billing"([^>]*)><div id="([^"]+)"/.exec(html) ?? []
 * if (!root?.includes(" disabled") || !root.includes(`aria-labelledby="${legendId}"`)) {
 *   throw new Error("the fieldset isn't disabled and named by its legend")
 * }
 * if (html.match(/<input [^>]* disabled/g)?.length !== 2) throw new Error("the fields' inputs aren't disabled")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Schema from "effect/Schema"
import { flag } from "./internal/attributes.ts"

/**
 * Props for the state of a `Fieldset`.
 *
 * **Details**
 *
 * - `disabled`: disables the `<fieldset>` with the native `disabled`
 *   attribute, which disables every control inside it, sets `data-disabled`
 *   on both parts, and disables each `Field` inside.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const FieldsetProps = Schema.Struct({
  disabled: Schema.optional(Schema.Boolean)
})

/**
 * The props of a `Fieldset`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type FieldsetProps = typeof FieldsetProps.Type

/**
 * A headless fieldset. Call it with the consumer's `h`, the `props`, and a
 * `view` closure that draws the root with `fieldset.root(h.fieldset)` and,
 * inside it, the legend with `fieldset.legend(h.div)` and the fields.
 *
 * **Details**
 *
 * The parts also return `disabled` as a boolean, for markup that depends
 * on it.
 *
 * The fieldset's own attributes win over the ones the consumer set on the
 * builder before the part, including the ones a state leaves absent:
 *
 * - `root`: `disabled`, `aria-disabled`, which it never sets, and
 *   `data-disabled`. `aria-labelledby` is a token list: the legend's id is
 *   added to the consumer's own.
 * - `legend`: `id` and `data-disabled`
 *
 * A part writes them when it is applied, so an attribute the consumer
 * chains after the part is the consumer's to answer for.
 *
 * The fieldset shares `{ disabled }` with the components in its `view`
 * closure, which is how a `Field` inside reads it.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Fieldset = Component.define({
  name: "Fieldset",
  scoped: false,
  props: FieldsetProps,
  model: Schema.Struct({}),
  message: Schema.Never,
  shares: {
    value: (_model, props) => ({ disabled: props.disabled === true }),
    schema: Schema.Struct({ disabled: Schema.Boolean })
  },
  elements: Html
}).make({
  init: () => ({}),
  update: (model) => model,
  parts: (_model, p) => {
    const disabled = p.props.disabled === true
    const legendId = p.id("legend")
    return {
      disabled,
      root: p.part("fieldset", (b) =>
        b.attrs({
          "aria-labelledby": legendId,
          "aria-disabled": undefined,
          "data-disabled": flag(disabled)
        })
          .disabled(disabled)),
      legend: p.part((b) => b.attrs({ id: legendId, "data-disabled": flag(disabled) }))
    }
  }
})
