import type { View } from "@effect/ui"
import type { Html } from "@effect/ui/html"

const drawing = {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": "true"
}

/**
 * A part of the article with an arrow from its first lines to the
 * DevTools button, in marker on the page. The arrow's tail is at a
 * place on the page and its tip is at the button, which is fixed to
 * the corner of the window, so the arrow stretches as the page
 * scrolls. styles.css moves the tail with the scroll position.
 */
export const LauncherPointer = <M>(
  h: Html.H<M>,
  content: ReadonlyArray<View.Content<M>>
) =>
  h.div.class("launcher-section mx-auto mt-[1.1em] max-w-(--column)")
    .children(
      // Where the tail is on the page. It has no height.
      h.div.class("launcher-tail").children(
        h.div.class("launcher-pointer").children(
          h.div.class("launcher-pointer-ink").children(
            // Fills the box from the tail to the tip, whatever its
            // shape. It ends going straight down, so the head, which
            // keeps its shape, always fits the end of the line.
            h.el("svg").attrs({
              ...drawing,
              class: "launcher-pointer-line",
              viewBox: "0 0 100 100",
              preserveAspectRatio: "none"
            }).children(
              h.el("path").attr("d", "M 0 0 C 58 0, 100 38, 100 100")
            ),
            h.el("svg").attrs({
              ...drawing,
              class: "launcher-pointer-head",
              viewBox: "0 0 26 15"
            }).children(
              h.el("path").attr("d", "M 1 1 L 13 15 L 25 1")
            )
          )
        )
      ),
      content
    )
