import { Markdown, MarkdownParser } from "@effect/ui/html"
import { describe, expect, it } from "@effect/vitest"
import { createRequire } from "node:module"

interface Example {
  readonly number: number
  readonly section: string
  readonly markdown: string
}

const spec: ReadonlyArray<Example> =
  createRequire(import.meta.url)("commonmark-spec").tests

const outcome = (markdown: string): object => {
  try {
    return {
      document: Markdown.encodeDocument(MarkdownParser.parseMarkdown(markdown))
    }
  } catch (error) {
    return {
      error: error instanceof MarkdownParser.ParseError
        ? error.message
        : String(error)
    }
  }
}

describe("CommonMark spec", () => {
  it("parses every example to its checked-in document or problem", async () => {
    const lines = spec.map(({ markdown, number, section }) =>
      JSON.stringify({
        example: number,
        section,
        ...outcome(markdown.replaceAll("→", "\t"))
      })
    )

    expect(spec).toHaveLength(652)
    await expect(lines.join("\n") + "\n").toMatchFileSnapshot(
      "./fixtures/commonmark.jsonl"
    )
  })
})
