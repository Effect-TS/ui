import * as Html from "@effect/ui/html/Html"
import * as View from "@effect/ui/View"
import { visuallyHidden } from "./attributes.ts"

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

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

// The markup that makes NVDA read the label of a bar: without content of
// its own after the label, it reads the value alone. The root appends it
// after all its children.
export const nvdaLabel = View.toNode(
  new Html.Element<never>("span").attr("role", "presentation").attr("style", visuallyHidden).children("x")
)
