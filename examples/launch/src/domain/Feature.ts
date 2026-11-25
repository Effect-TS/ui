import type { Markdown } from "@effect/ui/html"
import type { IconName } from "../components/Icon.ts"

/**
 * The icon of each bullet the article draws with one, by the bullet's
 * bold label. A bullet whose label isn't listed stays a plain bullet.
 *
 * A new capability has an icon of its own and is drawn as a row. What
 * carries over from Foldkit 0.x has `kept`, and is drawn as an entry
 * of a checklist.
 */
export const icons: Readonly<Record<string, IconName>> = {
  "Services per Component": "plug",
  "Code splitting": "split",
  "Control overlapping Commands": "layers",
  "The same structure everywhere": "kept",
  "Explicit state transitions": "kept",
  "Side effects as values": "kept",
  "Tests that declare what happened": "kept",
  "A record of what happened": "kept"
}

export interface Feature {
  readonly title: string
  readonly icon: IconName
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
 * Reads a bullet written as `**Label:** description` whose label has
 * an icon. Any other bullet gives `undefined`.
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
  const icon = icons[title]
  if (icon === undefined) return undefined
  // The space between the label and the description goes with the
  // label.
  const description = next?._tag === "Text"
    ? [{ ...next, value: next.value.trimStart() }, ...rest]
    : next === undefined
    ? []
    : [next, ...rest]
  return { title, icon, description }
}
