import { MarkdownParser } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { Frontmatter, Islands } from "./Island.ts"
import { fromDocument } from "./Prompt.ts"

const { document } = MarkdownParser.parseMarkdownWithFrontmatter(
  readFileSync(new URL("../article.md", import.meta.url), "utf8"),
  { islands: Islands, frontmatter: Frontmatter }
)

const prompts = fromDocument(document)

describe("Prompt", () => {
  it("finds the article's prompts", () => {
    assert.isAbove(prompts.length, 1)
  })

  it("gives every prompt a tab of its own", () => {
    const labels = prompts.map((prompt) => prompt.label)
    assert.deepStrictEqual(labels, [...new Set(labels)])
  })

  it("points every prompt at the article", () => {
    assert.deepStrictEqual(
      prompts.filter((prompt) => !prompt.prompt.includes("$URL")),
      []
    )
  })
})
