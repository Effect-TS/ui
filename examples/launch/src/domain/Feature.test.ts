import { type Markdown, MarkdownParser } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Array, Order } from "effect"
import { readFileSync } from "node:fs"
import { fromItem, icons } from "./Feature.ts"
import { Frontmatter, Islands } from "./Island.ts"

const { document } = MarkdownParser.parseMarkdownWithFrontmatter(
  readFileSync(new URL("../article.md", import.meta.url), "utf8"),
  { islands: Islands, frontmatter: Frontmatter }
)

const lists = document.blocks.filter(
  (block): block is Markdown.List => block._tag === "List"
)

describe("Feature", () => {
  it("draws a list with icons only when every bullet has one", () => {
    const mixed = lists.filter((list) => {
      const cards = list.items.filter((item) =>
        fromItem(item) !== undefined
      )
      return cards.length > 0 && cards.length < list.items.length
    })
    assert.deepStrictEqual(mixed, [])
  })

  it("has a bullet in the article for every icon it lists", () => {
    const titles = lists.flatMap((list) =>
      list.items.flatMap((item) => fromItem(item)?.title ?? [])
    )
    assert.deepStrictEqual(
      Array.sort(titles, Order.String),
      Array.sort(Object.keys(icons), Order.String)
    )
  })

  it("reads the label and leaves the description without it", () => {
    const feature = lists.flatMap((list) =>
      list.items.flatMap((item) => fromItem(item) ?? [])
    ).find(({ title }) => title === "Code splitting")
    assert.strictEqual(feature?.icon, "split")
    const first = feature?.description[0]
    assert.isTrue(
      first?._tag === "Text" &&
        first.value.startsWith("Load a Component")
    )
  })
})
