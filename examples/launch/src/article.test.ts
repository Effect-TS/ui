import { MarkdownParser } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { DateTime, Option, Schema } from "effect"
import { readFileSync } from "node:fs"
import { toMarkdown } from "./domain/ArticleText.ts"
import { Frontmatter, Islands } from "./domain/Island.ts"
import { fromDocument } from "./domain/Section.ts"
import type { Snippets } from "./domain/Snippet.ts"

const source = readFileSync(
  new URL("article.md", import.meta.url),
  "utf8"
)
const indexHtml = readFileSync(
  new URL("../index.html", import.meta.url),
  "utf8"
)
const parsed = MarkdownParser.parseMarkdownWithFrontmatter(
  source,
  { islands: Islands, frontmatter: Frontmatter }
)

describe("article", () => {
  it("gives every in-page link a heading to land on", () => {
    const ids = fromDocument(parsed.document).map(({ id }) => id)
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

  it("keeps frontmatter dates valid and in sync with index.html", () => {
    const raw = Option.getOrThrow(parsed.frontmatter)
    const meta = Schema.decodeUnknownSync(Frontmatter)(raw)
    assert.isTrue(
      DateTime.isGreaterThanOrEqualTo(meta.updated, meta.published)
    )
    assert.include(
      indexHtml,
      `<meta property="article:published_time" content="${
        DateTime.formatIsoDateUtc(meta.published)
      }" />`
    )
    assert.include(
      indexHtml,
      `<meta property="article:modified_time" content="${
        DateTime.formatIsoDateUtc(meta.updated)
      }" />`
    )
  })

  it("renders title and dates in the Markdown export", () => {
    const exported = (updated: string) =>
      toMarkdown(
        [
          "---",
          "title: Introducing Effect UI",
          "published: 2026-11-26",
          `updated: ${updated}`,
          "---",
          "",
          "Hello."
        ].join("\n"),
        {} as Snippets
      )
    assert.strictEqual(
      exported("2026-11-27"),
      "# Introducing Effect UI\n\nPublished Nov 26, 2026 · Updated Nov 27, 2026\n\nHello."
    )
    assert.strictEqual(
      exported("2026-11-26"),
      "# Introducing Effect UI\n\nPublished Nov 26, 2026\n\nHello."
    )
  })

  it("mentions Foldkit only in the What happens next section", () => {
    const [before, after = ""] = source.split("## What happens next")
    assert.isNotEmpty(after)
    assert.notMatch(before, /foldkit/i)
    assert.match(after, /foldkit/i)
  })

  it("exports Architecture and Diagram islands in Markdown", () => {
    const exported = toMarkdown(
      [
        "---",
        "title: Introducing Effect UI",
        "published: 2026-11-26",
        "updated: 2026-11-26",
        "---",
        "",
        "::Architecture",
        "",
        "::Diagram{scenario=\"sharedState\"}"
      ].join("\n"),
      {} as Snippets
    )
    assert.include(
      exported,
      "Every Component has a Model, an update and a view of its own."
    )
    assert.include(
      exported,
      "**A Provider's Model holds the shared value.** Changed by: A1."
    )
    assert.notInclude(exported, "**Effect UI.**")
  })
})
