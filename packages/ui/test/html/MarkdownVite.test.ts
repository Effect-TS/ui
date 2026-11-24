import { Markdown, type MarkdownParser } from "@effect/ui/html"
import { markdown } from "@effect/ui/html/MarkdownVite"
import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"

const lines = (sourceLines: ReadonlyArray<string>): string =>
  sourceLines.join("\n")

const transform = (
  source: string,
  id: string,
  options: MarkdownParser.Options = {
    islands: {
      Counter: Schema.Struct({ label: Schema.optionalKey(Schema.String) })
    }
  }
) => markdown(options).transform(source, id)

describe("markdown", () => {
  it("compiles .md modules into a decodable encoded default export", () => {
    const result = transform("# Title", "/site/src/content/about.md")
    if (result === undefined) {
      throw new Error("Expected the transform to compile the .md module")
    }
    expect(result.code.startsWith("export default ")).toBe(true)

    const [documentLine = ""] = result.code.split("\n")
    const wire: unknown = JSON.parse(
      documentLine.slice("export default ".length)
    )
    expect(Markdown.decodeDocument(wire).blocks.map((block) => block._tag))
      .toStrictEqual(["Heading"])
    expect(result.code).toContain("export const frontmatter = undefined")
  })

  it("emits validated frontmatter as a named export", () => {
    const options: MarkdownParser.Options = {
      frontmatter: Schema.Struct({ title: Schema.String })
    }

    expect(
      transform(
        lines(["---", "title: My Post", "---", "", "# Title"]),
        "/site/src/content/post.md",
        options
      )?.code
    )
      .toContain("export const frontmatter = {\"title\":\"My Post\"}")
    expect(transform("# Title", "/site/src/content/about.md", options)?.code)
      .toContain(
        "export const frontmatter = undefined"
      )
  })

  it("leaves non-markdown modules untouched", () => {
    expect(transform("# Title", "/site/src/main.ts")).toBeUndefined()
    expect(transform("# Title", "/site/src/content/about.md.bak"))
      .toBeUndefined()
  })

  it("fails the build on source outside the vocabulary", () => {
    expect(() => transform("::Conuter", "/site/src/content/post.md"))
      .toThrowError(
        "Unknown island \"Conuter\" (line 1). Allowed islands: Counter."
      )
  })

  it("checks its options when the plugin is created", () => {
    const malformed = {
      frontmatter: Schema.String
    } as unknown as MarkdownParser.Options

    expect(() => markdown(malformed)).toThrowError(/must be a Schema struct/)
  })
})
