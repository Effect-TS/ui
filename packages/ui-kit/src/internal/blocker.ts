import * as Html from "@effect/ui/html/Html"
import * as View from "@effect/ui/View"
import { noSelect } from "./attributes.ts"

export const blockers = (attribute: string) => {
  const blocker = new Html.Element<never>("div")
    .attr("role", "presentation")
    .attr(attribute, "")
    .attr("style", "position:fixed;inset:0;z-index:-1;" + noSelect)
  return { open: View.toNode(blocker), closed: View.toNode(blocker.attr("inert", "")) }
}

export const cutPath = (holes: ReadonlyArray<DOMRect>): string =>
  "polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%," +
  holes.flatMap((r) => [[r.left, r.top], [r.left, r.bottom], [r.right, r.bottom], [r.right, r.top], [r.left, r.top]])
    .map(([x, y]) => x + "px " + y + "px").join(",") +
  ")"
