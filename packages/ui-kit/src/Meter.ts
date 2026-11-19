/**
 * A meter that shows a measurement within a known range, such as disk
 * usage or a battery level, whose value lives in the consumer's Model. It
 * is a headless component: the label needs an id for the meter to point
 * at. It keeps no state of its own, and emits nothing.
 *
 * Use a meter for a quantity that stands still, and `Progress` for a task
 * that moves toward done.
 *
 * **Anatomy**
 *
 * | Part        | Element                  |
 * | :---------- | :----------------------- |
 * | `root`      | `<div role="meter">`     |
 * | `label`     | `<span>` inside the root |
 * | `value`     | `<span>` inside the root |
 * | `track`     | `<div>` inside the root  |
 * | `indicator` | `<div>` inside the track |
 *
 * Each part takes the consumer's builder and returns it, so the consumer
 * goes on chaining and adds children with `.children(...)`. `root`
 * appends a visually hidden `<span role="presentation">` after all its
 * children, which makes NVDA read the label. `value` fills in the value
 * text when the consumer gives it no children. The other parts add no
 * markup.
 *
 * The root's `aria-labelledby` always points at the label's id. When you
 * draw no label, name the meter with `aria-label` on the root: a screen
 * reader skips an id that nothing has.
 *
 * **Data attributes**
 *
 * None: a meter has no states to style.
 *
 * **Keyboard**
 *
 * None: the meter isn't focusable and handles no events.
 *
 * **Indicator width**
 *
 * `indicator` adds `inset-inline-start:0;height:inherit;width:<percentage>%`
 * after the consumer's inline style, so its width wins and the consumer's
 * other declarations stay. To draw the meter another way, such as
 * vertically or as a ring, skip `indicator` and use `s.percentage`.
 *
 * **Example** (A labelled storage meter)
 *
 * ```ts import.meta.vitest
 * import { Component } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Meter } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const Storage = Component.define({
 *   name: "Storage",
 *   model: Schema.Struct({ used: Schema.Number, quota: Schema.Number }),
 *   message: Schema.Never,
 *   elements: Html
 * }).make({
 *   init: () => ({ used: 12, quota: 16 }),
 *   update: (model) => model,
 *   view: (model, h) =>
 *     Meter(h, {
 *       props: { value: model.used, max: model.quota, valueText: `${model.used} of ${model.quota} GB` },
 *       view: (s) =>
 *         s.root(h.div.class("meter")).children(
 *           s.label(h.span).children("Storage"),
 *           s.value(h.span),
 *           s.track(h.div.class("track")).children(s.indicator(h.div.class("fill")))
 *         )
 *     })
 * })
 *
 * // The root keeps the consumer's class and reports the value, and the indicator is 75% wide.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Storage, {}))
 * if (!/<div class="meter"[^>]* role="meter"[^>]* aria-valuenow="12" aria-valuetext="12 of 16 GB"/.test(html)) {
 *   throw new Error("the root isn't a meter at 12 of 16")
 * }
 * if (!/<div class="fill"[^>]* style="[^"]*width:75%"/.test(html)) throw new Error("the indicator isn't 75% wide")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Schema from "effect/Schema"
import { withStyle } from "./internal/attributes.ts"
import { fillValue, indicatorSize, nvdaLabel, percentText, placeInRange } from "./internal/range.ts"

/**
 * Props for the value of a `Meter`.
 *
 * **Details**
 *
 * - `value`: the measurement, between `min` and `max`. Required: the
 *   consumer owns it. A value outside the range is clamped to it, and
 *   `NaN` counts as `min`.
 * - `min` and `max`: the range, `0` and `100` by default.
 * - `valueText`: the text that describes the value, as the root's
 *   `aria-valuetext` and as what `value` shows. Left out, it is the
 *   percentage, rounded to a whole number, as `"40%"`, the same on the
 *   server and in the browser. Build your own text, such as
 *   `"12 of 16 GB"`, in the view from your Model.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MeterProps = Schema.Struct({
  value: Schema.Number,
  min: Schema.optional(Schema.Number),
  max: Schema.optional(Schema.Number),
  valueText: Schema.optional(Schema.String)
})

/**
 * The props of a `Meter`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MeterProps = typeof MeterProps.Type

/**
 * A headless meter. Call it with the consumer's `h`, the `props`, and a
 * `view` closure that draws the root with `s.root(h.div)`, usually with
 * a label, the value and a track holding the indicator inside it.
 *
 * **Details**
 *
 * The parts also return:
 *
 * - `percentage`: the value's share of the range, from 0 to 100
 * - `valueText`: the text `value` shows
 *
 * The meter's own attributes win over the ones the consumer set on the
 * builder before the part:
 *
 * - `root`: `role`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`
 *   (the clamped value) and `aria-valuetext`. `aria-labelledby` is a
 *   token list: the label's id is added to the consumer's own.
 * - `label`: `id` and `role="presentation"`
 * - `value`: `aria-hidden="true"`, as the root already reports the value
 *
 * A part writes them when it is applied, so an attribute the consumer
 * chains after the part is the consumer's to answer for. The indicator's
 * width and the root's hidden span are added when the element is built,
 * after everything the consumer chained.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Meter = Component.define({
  name: "Meter",
  props: MeterProps,
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: (model) => model,
  parts: (_model, p) => {
    const min = p.props.min ?? 0
    const max = p.props.max ?? 100
    const { percentage, value } = placeInRange(p.props.value, min, max)
    const valueText = p.props.valueText ?? percentText(percentage)
    const labelId = p.id("label")
    return {
      percentage,
      valueText,
      root: p.part("div", (b) =>
        b.attr("role", "meter")
          .attr("aria-valuemin", String(min))
          .attr("aria-valuemax", String(max))
          .attr("aria-valuenow", String(value))
          .attr("aria-valuetext", valueText)
          // A token list: added to the consumer's own.
          .attr("aria-labelledby", labelId)
          // After every child, including the ones chained after the part.
          .forward((node) => node.children(nvdaLabel))),
      label: p.part("span", (b) => b.attr("id", labelId).attr("role", "presentation")),
      value: p.part("span", (b) => b.attr("aria-hidden", "true").forward((node) => fillValue(node, valueText))),
      track: p.part("div", (b) => b),
      // After the consumer's inline style, set before the part or chained
      // after it, so the width wins and the consumer's other declarations stay.
      indicator: p.part(
        "div",
        (b) => b.forward((node) => node.attr("style", withStyle(node.attrs.style, indicatorSize(percentage))))
      )
    }
  }
})
