import * as Html from "@effect/ui/html/Html"
import * as View from "@effect/ui/View"
import { flag, noSelect, visuallyHidden } from "./attributes.ts"

export const blockers = (attribute: string) => {
  const blocker = new Html.Element<never>("div")
    .attrs({
      role: "presentation",
      [attribute]: "",
      style: "position:fixed;inset:0;z-index:-1;" + noSelect
    })
  const is = (target: Node): boolean =>
    target instanceof Element && target.hasAttribute(attribute)
  return {
    open: View.toNode(blocker),
    closed: View.toNode(blocker.attr("inert", "")),
    is,
    owns: (layer: Node, target: Node): boolean =>
      is(target) && target.parentNode === layer
  }
}

// A backdrop drawn in place covers its containing block, not the viewport.
export const backdropStyle = (topLayer: boolean, pressable: boolean): string =>
  "position:" + (topLayer ? "fixed" : "absolute") +
  ";inset:0;width:auto;height:auto;max-width:none;max-height:none;margin:0;" +
  noSelect + (pressable ? "" : ";pointer-events:none")

// A close button for screen readers, which can't press outside the popup.
export const dismissAttrs = (label: string | undefined, open: boolean) => ({
  role: "button",
  "aria-label": label ?? "Dismiss",
  hidden: flag(!open),
  style: visuallyHidden
})

export const dismissSpan = () =>
  new Html.Element<
    never,
    never,
    Html.EventsOf<"span">,
    HTMLSpanElement,
    "span"
  >("span")

export const cutPath = (holes: ReadonlyArray<DOMRect>): string =>
  "polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%," +
  holes.flatMap((
    r
  ) => [[r.left, r.top], [r.left, r.bottom], [r.right, r.bottom], [
    r.right,
    r.top
  ], [r.left, r.top]])
    .map(([x, y]) => x + "px " + y + "px").join(",") +
  ")"
