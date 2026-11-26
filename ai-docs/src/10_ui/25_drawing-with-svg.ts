/**
 * @title Drawing icons and charts with SVG
 *
 * SVG tags have builders on `h` like HTML tags: `h.svg`, `h.path`,
 * `h.circle`, `h.g` and the rest. Attribute names are checked per tag,
 * and SVG's `<text>` is `h.svgText` because `h.text` makes a text node.
 */
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

// An icon is a view function, like any reusable piece of view. Its stroke
// uses currentColor, so it takes the color of the text around it.
const CheckIcon = <M>(h: Html.H<M>) =>
  h.svg
    .class("icon")
    .attrs({
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      // Decorative: the button's text says what it does.
      "aria-hidden": "true"
    })
    .children(h.path.attr("d", "M5 12l5 5L20 7"))

// SVG attribute names are case-sensitive and mix camelCase (viewBox) with
// hyphens (stroke-width). A typo such as `viewbox` or `strok-width` is a
// type error, where the browser would silently ignore it. Values are
// strings, as with every attribute.
const Ring = <M>(h: Html.H<M>, done: number, total: number) => {
  const r = 16
  const length = 2 * Math.PI * r
  const shown = total === 0 ? 0 : done / total
  // role="img" with a label reads the chart as one image to screen readers.
  return h.svg.attrs({
    viewBox: "0 0 40 40",
    role: "img",
    "aria-label": `${done} of ${total} done`
  }).children(
    h.circle.attrs({
      cx: "20",
      cy: "20",
      r: String(r),
      fill: "none",
      stroke: "lightgray",
      "stroke-width": "4"
    }),
    h.circle.attrs({
      cx: "20",
      cy: "20",
      r: String(r),
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "4",
      "stroke-dasharray": `${length * shown} ${length}`,
      transform: "rotate(-90 20 20)"
    }),
    // `h.svgText` is SVG's <text> element.
    h.svgText.attrs({
      x: "20",
      y: "24",
      "text-anchor": "middle",
      "font-size": "10"
    }).children(`${done}/${total}`)
  )
}

export const Checklist = Html.component({
  name: "Checklist",
  model: Schema.Struct({ done: Schema.Number, total: Schema.Number }),
  message: Schema.Literal("ClickedDone")
}).make({
  init: () => ({ done: 0, total: 3 }),
  update: ($) => ({
    ...$.model,
    done: Math.min($.model.done + 1, $.model.total)
  }),
  view: (h, { done, total }) =>
    h.div.children(
      Ring(h, done, total),
      // SVG builders are ordinary children of HTML elements.
      h.button.on("click", "ClickedDone").children(CheckIcon(h), "Done")
    )
})
