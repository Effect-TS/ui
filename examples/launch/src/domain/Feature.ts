import type { Markdown } from "@effect/ui/html"
import type { IconName } from "../components/Icon.ts"

/** How a list of bullets with icons is laid out. */
export type Layout = "rows" | "grid" | "checklist"

/**
 * The icon and the layout of each bullet the article draws with an
 * icon, by the bullet's bold label. A bullet whose label isn't listed
 * stays a plain bullet.
 *
 * - `rows`: a new capability, one to a row.
 * - `grid`: a short point, two to a row.
 * - `checklist`: something that carries over from Foldkit 0.x.
 */
const features: Readonly<
  Record<string, readonly [IconName, Layout]>
> = {
  Fetching: ["download", "grid"],
  Caching: ["database", "grid"],
  Freshness: ["clock", "grid"],
  States: ["loader", "grid"],
  Timeline: ["list", "grid"],
  "Cause and effect": ["workflow", "grid"],
  "Time travel": ["history", "grid"],
  "For agents": ["bot", "grid"],
  "Services per Component": ["plug", "rows"],
  "Code splitting": ["split", "rows"],
  "Control overlapping Commands": ["layers", "rows"],
  "A constrained, agent-friendly architecture": ["kept", "checklist"],
  "Predictable state changes": ["kept", "checklist"],
  "Side effects as values that the runtime runs": [
    "kept",
    "checklist"
  ],
  "Clear, readable tests focused on behavior, not plumbing": [
    "kept",
    "checklist"
  ],
  "A Message log you can inspect and replay": ["kept", "checklist"]
}

/** The label of every bullet that has an icon. */
export const labels: ReadonlyArray<string> = Object.keys(features)

export interface Feature {
  readonly title: string
  readonly icon: IconName
  readonly layout: Layout
  /** What follows the label. */
  readonly description: ReadonlyArray<Markdown.Inline>
}

const text = (content: ReadonlyArray<Markdown.Inline>): string =>
  content.map((node) =>
    "value" in node
      ? node.value
      : "content" in node
      ? text(node.content)
      : ""
  ).join("")

/**
 * Reads a bullet written as `**Label:** description`, or as a bold
 * statement with no description, whose label has an icon. Any other
 * bullet gives `undefined`.
 */
export const fromItem = (
  item: Markdown.ListItem
): Feature | undefined => {
  const [block, ...others] = item.blocks
  if (block?._tag !== "Paragraph" || others.length > 0) {
    return undefined
  }
  const [label, next, ...rest] = block.content
  if (label?._tag !== "Strong") return undefined
  const title = text(label.content).replace(/:$/, "")
  const feature = features[title]
  if (feature === undefined) return undefined
  const [icon, layout] = feature
  // The space between the label and the description goes with the
  // label.
  const description = next?._tag === "Text"
    ? [{ ...next, value: next.value.trimStart() }, ...rest]
    : next === undefined
    ? []
    : [next, ...rest]
  return { title, icon, layout, description }
}
