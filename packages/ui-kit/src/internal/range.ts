import * as Html from "@effect/ui/html/Html"
import * as View from "@effect/ui/View"
import { visuallyHidden } from "./attributes.ts"

export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

// Where a number sits in a range: the number clamped to the range, and its
// share of the range as a percentage from 0 to 100. `NaN` counts as `min`,
// and an empty range as 0%.
export const placeInRange = (
  value: number,
  min: number,
  max: number
): { readonly value: number; readonly percentage: number } => {
  const raw = ((value - min) * 100) / (max - min)
  return {
    value: clamp(Number.isNaN(value) ? min : value, min, max),
    percentage: clamp(Number.isNaN(raw) ? 0 : raw, 0, 100)
  }
}

// The default text for a value: its percentage, rounded to a whole number,
// the same on the server and in the browser.
export const percentText = (percentage: number): string => `${Math.round(percentage)}%`

// What the indicator adds to its inline style, after the consumer's, to be
// as wide as the percentage.
export const indicatorSize = (percentage: number): string => `inset-inline-start:0;height:inherit;width:${percentage}%`

// The value part's text, unless there is none or the consumer gave the part
// children of its own. Run in `forward`, so it reads the children chained
// after the part too.
export const fillValue = <Msg, R, Handlers, HostNode, Tag extends string>(
  node: View.ContainerBuilder<Msg, R, Handlers, HostNode, Tag>,
  text: string | undefined
): View.ContainerBuilder<Msg, R, Handlers, HostNode, Tag> =>
  text === undefined || (node.content !== undefined && node.content.length > 0) ? node : node.children(text)

// The markup that makes NVDA read the label of a bar: without content of
// its own after the label, it reads the value alone. The root appends it
// after all its children.
export const nvdaLabel = View.toNode(
  new Html.Element<never>("span").attrs({ role: "presentation", style: visuallyHidden }).children("x")
)
