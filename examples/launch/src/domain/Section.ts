import type { Markdown } from "@effect/ui/html"
import { Schema } from "effect"

export const Section = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  isNested: Schema.Boolean
})
export type Section = typeof Section.Type

const text = (content: ReadonlyArray<Markdown.Inline>): string =>
  content.map((node) =>
    "value" in node
      ? node.value
      : "content" in node
      ? text(node.content)
      : ""
  ).join("")

export const fromHeading = (heading: Markdown.Heading): Section => {
  const label = text(heading.content)
  return {
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(
      /^-|-$/g,
      ""
    ),
    label,
    isNested: heading.level > 2
  }
}

export const fromDocument = (
  document: Markdown.Document
): ReadonlyArray<Section> =>
  document.blocks.flatMap((block) =>
    block._tag === "Heading" ? [fromHeading(block)] : []
  )
