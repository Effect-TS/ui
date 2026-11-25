import type { View } from "@effect/ui"
import type { Html } from "@effect/ui/html"

/**
 * A part of the article with an arrow that points at the DevTools
 * button in the bottom-right corner of the window. The arrow is fixed
 * to the window, and styles.css draws it as this part scrolls past.
 */
export const LauncherPointer = <M>(
  h: Html.H<M>,
  content: ReadonlyArray<View.Content<M>>
) =>
  h.div.class("launcher-section mx-auto mt-[1.1em] max-w-(--column)")
    .children(
      content,
      h.el("svg").attrs({
        class: "launcher-pointer",
        viewBox: "0 0 100 100",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2.2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "aria-hidden": "true"
      }).children(
        // A length of 1, so CSS can draw the line from 0 to 1.
        h.el("path").attrs({
          class: "launcher-pointer-line",
          d: "M 6 14 C 48 6, 86 30, 86 90",
          pathLength: "1"
        }),
        h.el("path").attrs({
          class: "launcher-pointer-head",
          d: "M 76 78 L 86 91 L 96 78"
        })
      )
    )
