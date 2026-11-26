import { MarkdownParser } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { Frontmatter, Islands } from "./domain/Island.ts"
import { fromDocument } from "./domain/Section.ts"

describe("article", () => {
  it("gives every in-page link a heading to land on", () => {
    const source = readFileSync(
      new URL("article.md", import.meta.url),
      "utf8"
    )
    const { document } = MarkdownParser.parseMarkdownWithFrontmatter(
      source,
      { islands: Islands, frontmatter: Frontmatter }
    )
    const ids = fromDocument(document).map(({ id }) => id)
    const links = Array.from(
      source.matchAll(/\]\(#([^)]+)\)/g),
      (match) => match[1]
    )
    assert.isNotEmpty(links)
    assert.deepStrictEqual(
      links.filter((link) => !ids.includes(link)),
      []
    )
  })
})
