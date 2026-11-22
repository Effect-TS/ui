/**
 * A progress bar for a task that takes a while, whose value lives in the
 * consumer's Model. It is a headless component: the label needs an id for
 * the bar to point at. It keeps no state of its own, and emits nothing.
 *
 * **Anatomy**
 *
 * | Part        | Element                       |
 * | :---------- | :---------------------------- |
 * | `root`      | `<div role="progressbar">`    |
 * | `label`     | `<span>` inside the root      |
 * | `value`     | `<span>` inside the root      |
 * | `track`     | `<div>` inside the root       |
 * | `indicator` | `<div>` inside the track      |
 *
 * Each part takes the consumer's builder and returns it, so the consumer
 * goes on chaining and adds children with `.children(...)`. `root`
 * appends a visually hidden `<span role="presentation">` after all its
 * children, which makes NVDA read the label. `value` fills in the value
 * text when the consumer gives it no children. The other parts add no
 * markup.
 *
 * The root's `aria-labelledby` always points at the label's id. When you
 * draw no label, name the bar with `aria-label` on the root: a screen
 * reader skips an id that nothing has.
 *
 * **Data attributes**
 *
 * On every part, each present with an empty value or absent:
 *
 * - `data-progressing`: the value is below `max`
 * - `data-complete`: the value is `max` or above
 * - `data-indeterminate`: the value is `null`
 *
 * **Keyboard**
 *
 * None: the bar isn't focusable and handles no events.
 *
 * **Indicator width**
 *
 * While the value is known, `indicator` adds
 * `inset-inline-start:0;height:inherit;width:<percentage>%` after the
 * consumer's inline style, so its width wins and the consumer's other
 * declarations stay. While indeterminate it adds nothing. To draw the
 * bar another way, such as vertically or as a ring, skip `indicator` and
 * use `progress.percentage`.
 *
 * **Example** (A labelled upload bar)
 *
 * ```ts import.meta.vitest
 * import { Component } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Progress } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const Upload = Component.define({
 *   name: "Upload",
 *   scoped: false,
 *   model: Schema.Struct({ sent: Schema.Number }),
 *   message: Schema.Never,
 *   elements: Html
 * }).make({
 *   init: () => ({ sent: 40 }),
 *   update: (model) => model,
 *   view: (model, h) =>
 *     Progress(h, {
 *       props: { value: model.sent },
 *       view: (progress) =>
 *         progress.root(h.div.class("progress")).children(
 *           progress.label(h.span).children("Uploading"),
 *           progress.value(h.span),
 *           progress.track(h.div.class("track")).children(progress.indicator(h.div.class("fill")))
 *         )
 *     })
 * })
 *
 * // The root keeps the consumer's class, reports the value, and the indicator is 40% wide.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Upload, {}))
 * if (!/<div class="progress"[^>]* role="progressbar"[^>]* aria-valuenow="40"/.test(html)) {
 *   throw new Error("the root isn't a progress bar at 40")
 * }
 * if (!/<div class="fill"[^>]* style="[^"]*width:40%"/.test(html)) throw new Error("the indicator isn't 40% wide")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Schema from "effect/Schema"
import { flag, withStyle } from "./internal/attributes.ts"
import { fillValue, indicatorSize, nvdaLabel, percentText, placeInRange } from "./internal/range.ts"

/**
 * Props for the value of a `Progress`.
 *
 * **Details**
 *
 * - `value`: how far the task has got, between `min` and `max`.
 *   Required: the consumer owns it. `null`, or a number that isn't
 *   finite, means the progress is unknown (indeterminate). A value
 *   outside the range is clamped to it.
 * - `min` and `max`: the range, `0` and `100` by default.
 * - `valueText`: the text that describes the value, as the root's
 *   `aria-valuetext` and as what `value` shows, in every state. Left out,
 *   it is the percentage, rounded to a whole number, as `"40%"`, the same
 *   on the server and in the browser. While indeterminate without
 *   `valueText`, `aria-valuetext` is `"indeterminate progress"` and
 *   `value` shows nothing. Build your own text, such as `"3 of 5 files"`,
 *   in the view from your Model.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ProgressProps = Schema.Struct({
  value: Schema.NullOr(Schema.Number),
  min: Schema.optional(Schema.Number),
  max: Schema.optional(Schema.Number),
  valueText: Schema.optional(Schema.String)
})

/**
 * The props of a `Progress`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ProgressProps = typeof ProgressProps.Type

/**
 * Where the task is: `"progressing"` below `max`, `"complete"` at
 * `max`, and `"indeterminate"` while the value is unknown.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ProgressStatus = "indeterminate" | "progressing" | "complete"

// The value within the range, its share of the range as a percentage, and
// the status, or nulls while the value is unknown.
const resolve = (props: ProgressProps) => {
  const min = props.min ?? 0
  const max = props.max ?? 100
  if (props.value === null || !Number.isFinite(props.value)) {
    return { min, max, value: null, percentage: null, status: "indeterminate" as ProgressStatus }
  }
  const { percentage, value } = placeInRange(props.value, min, max)
  const status: ProgressStatus = value === max ? "complete" : "progressing"
  return { min, max, value, percentage, status }
}

/**
 * A headless progress bar. Call it with the consumer's `h`, the `props`,
 * and a `view` closure that draws the root with `progress.root(h.div)`, usually
 * with a label, the value and a track holding the indicator inside it.
 *
 * **Details**
 *
 * The parts also return:
 *
 * - `status`: a `ProgressStatus`
 * - `percentage`: the value's share of the range, from 0 to 100, or
 *   `null` while indeterminate
 * - `valueText`: the text `value` shows, or `undefined` when it shows
 *   none
 *
 * The progress bar's own attributes win over the ones the consumer set on
 * the builder before the part, including the ones a state leaves absent:
 *
 * - `root`: `role`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`
 *   (absent while indeterminate) and `aria-valuetext`. `aria-labelledby`
 *   is a token list: the label's id is added to the consumer's own.
 * - `label`: `id` and `role="presentation"`
 * - `value`: `aria-hidden="true"`, as the root already reports the value
 * - every part: the data attributes
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
export const Progress = Component.define({
  name: "Progress",
  scoped: false,
  props: ProgressProps,
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: (model) => model,
  parts: (_model, p) => {
    const { max, min, percentage, status, value } = resolve(p.props)
    const valueText = p.props.valueText ?? (percentage === null ? undefined : percentText(percentage))
    // What the indicator adds to its inline style: nothing while indeterminate.
    const size = percentage === null ? undefined : indicatorSize(percentage)
    const labelId = p.id("label")
    // An attribute a part sets to `undefined` is removed from the consumer's
    // builder too, so a consumer's `data-complete` can't report a state the
    // progress isn't in.
    const state = <B extends { readonly attr: (name: string, value: string | undefined) => B }>(builder: B): B =>
      builder
        .attr("data-progressing", flag(status === "progressing"))
        .attr("data-complete", flag(status === "complete"))
        .attr("data-indeterminate", flag(status === "indeterminate"))
    return {
      status,
      percentage,
      valueText,
      root: p.part("div", (b) =>
        state(b)
          .attr("role", "progressbar")
          .attr("aria-valuemin", String(min))
          .attr("aria-valuemax", String(max))
          .attr("aria-valuenow", value === null ? undefined : String(value))
          .attr("aria-valuetext", valueText ?? "indeterminate progress")
          // A token list: added to the consumer's own.
          .attr("aria-labelledby", labelId)
          // After every child, including the ones chained after the part.
          .forward((node) => node.children(nvdaLabel))),
      label: p.part("span", (b) => state(b).attr("id", labelId).attr("role", "presentation")),
      value: p.part("span", (b) =>
        state(b)
          .attr("aria-hidden", "true")
          .forward((node) => fillValue(node, valueText))),
      track: p.part("div", state),
      indicator: p.part("div", (b) =>
        state(b)
          .forward((node) => size === undefined ? node : node.attr("style", withStyle(node.elementAttrs.style, size))))
    }
  }
})
