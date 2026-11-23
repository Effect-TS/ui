import { Markdown, MarkdownParser } from "@effect/ui/html"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"

const { parseMarkdown, parseMarkdownWithFrontmatter } = MarkdownParser

const lines = (...sourceLines: ReadonlyArray<string>): string => sourceLines.join("\n")

describe("parseMarkdown", () => {
  it("parses GFM strikethrough and tables with column alignments", () => {
    const row = (...cells: ReadonlyArray<string>) => ({
      _tag: "TableRow",
      cells: cells.map((value) => ({ _tag: "TableCell", content: [{ _tag: "Text", value }] }))
    })

    expect(
      parseMarkdown(
        lines("Some ~~loss~~.", "", "| Stock | Speed |", "| :--- | ---: |", "| Portra | 400 |", "| Ektar | 100 |")
      ).blocks
    ).toStrictEqual([
      {
        _tag: "Paragraph",
        content: [
          { _tag: "Text", value: "Some " },
          { _tag: "Strikethrough", content: [{ _tag: "Text", value: "loss" }] },
          { _tag: "Text", value: "." }
        ]
      },
      {
        _tag: "Table",
        alignments: ["Left", "Right"],
        headerRow: row("Stock", "Speed"),
        bodyRows: [row("Portra", "400"), row("Ektar", "100")]
      }
    ])
  })

  it("parses leaf and container islands and validates declared island attributes", () => {
    const document = parseMarkdown(
      lines("::Counter{label=\"Clicks\"}", "", ":::Note", "Nested *prose* inside.", ":::"),
      { islands: { Counter: Schema.Struct({ label: Schema.optionalKey(Schema.String) }), Note: Schema.Struct({}) } }
    )

    expect(document.blocks).toStrictEqual([
      { _tag: "Island", name: "Counter", attributes: { label: "Clicks" }, blocks: [] },
      {
        _tag: "Island",
        name: "Note",
        attributes: {},
        blocks: [
          {
            _tag: "Paragraph",
            content: [
              { _tag: "Text", value: "Nested " },
              { _tag: "Emphasis", content: [{ _tag: "Text", value: "prose" }] },
              { _tag: "Text", value: " inside." }
            ]
          }
        ]
      }
    ])
  })

  it("round-trips through the JSON wire form", () => {
    const document = parseMarkdown(
      lines(
        "# Title",
        "",
        "Prose with a [link](https://example.com).",
        "",
        "3. starts at three",
        "",
        "::Counter{label=\"Clicks\"}"
      )
    )
    const wire: unknown = JSON.parse(JSON.stringify(Markdown.encodeDocument(document)))

    expect(Markdown.decodeDocument(wire)).toStrictEqual(document)
  })

  it("rejects non-Struct island definitions", () => {
    const message = "Island \"Counter\" in the Markdown options must map to a Schema struct describing its attributes."

    expect(() => parseMarkdown("::Counter", { islands: { Counter: ["label"] } } as unknown as MarkdownParser.Options))
      .toThrowError(message)
    expect(() =>
      parseMarkdown("::Counter", { islands: { Counter: Schema.String } } as unknown as MarkdownParser.Options)
    ).toThrowError(message)
  })

  it("rejects island names missing from the declared islands", () => {
    expect(() => parseMarkdown("::Conuter", { islands: { Counter: Schema.Struct({}), Note: Schema.Struct({}) } }))
      .toThrowError("Unknown island \"Conuter\" (line 1). Allowed islands: Counter, Note.")
  })

  it("rejects unknown island attributes", () => {
    expect(() =>
      parseMarkdown("::Counter{labl=\"Clicks\"}", {
        islands: { Counter: Schema.Struct({ label: Schema.optionalKey(Schema.String) }) }
      })
    ).toThrowError("Unknown attribute \"labl\" for island \"Counter\" (line 1). Allowed attributes: label.")
    expect(() =>
      parseMarkdown(lines(":::Note{tone=\"calm\"}", "Prose.", ":::"), { islands: { Note: Schema.Struct({}) } })
    ).toThrowError("Unknown attribute \"tone\" for island \"Note\" (line 1). It takes no attributes.")
  })

  it("rejects attribute values outside the island schema", () => {
    expect(() => parseMarkdown("::Counter", { islands: { Counter: Schema.Struct({ label: Schema.String }) } }))
      .toThrowError(/Invalid attributes for island "Counter" \(line 1\)/)
  })

  it("rejects task list items", () => {
    expect(() => parseMarkdown("- [ ] pending")).toThrowError(/Unsupported markdown node "task list item" \(line 1\)/)
  })

  it("rejects inline directives", () => {
    expect(() => parseMarkdown("An inline :Counter[label] directive.")).toThrowError(
      /Inline directives are not supported/
    )
    expect(() => parseMarkdown("An inline :Counter{step=2} directive.")).toThrowError(
      /Inline directives are not supported/
    )
  })

  it("keeps a bare :name in prose as text", () => {
    expect(parseMarkdown("Meet at 10:30, see :Counter.").blocks).toStrictEqual([
      { _tag: "Paragraph", content: [{ _tag: "Text", value: "Meet at 10:30, see :Counter." }] }
    ])
  })

  it("rejects leaf directive labels", () => {
    expect(() => parseMarkdown("::Counter[Clicks while reading]")).toThrowError(
      /Leaf directive labels \(`::Name\[label\]`\) are not supported/
    )
  })

  it("rejects executable URL schemes in links and images", () => {
    expect(() => parseMarkdown("[click](javascript:alert(1))")).toThrowError(
      /Unsupported URL scheme in "javascript:alert\(1\)" \(line 1\)/
    )
    expect(() => parseMarkdown("[click](JaVaScRiPt:alert(1))")).toThrowError(/Unsupported URL scheme/)
    expect(() => parseMarkdown("[click](java&#9;script:alert(1))")).toThrowError(/Unsupported URL scheme/)
    expect(() => parseMarkdown("![x](data:image/svg+xml,payload)")).toThrowError(/Unsupported URL scheme/)
  })

  it("accepts relative, fragment, and allowlisted absolute URLs", () => {
    const document = parseMarkdown(
      lines(
        "[relative](./posts)",
        "[fragment](#the-fold)",
        "[absolute](https://example.com)",
        "[email](mailto:devin@example.com)"
      )
    )

    expect(document.blocks).toHaveLength(1)
  })

  it("rejects YAML frontmatter when no frontmatter schema is configured", () => {
    expect(() => parseMarkdown(lines("---", "title: My Post", "---", "", "Prose."))).toThrowError(
      /Frontmatter is not supported/
    )
  })

  it("reports the earliest problem with its line as a ParseError", () => {
    try {
      parseMarkdown(lines("Fine.", "", "<b>bold</b> and [x](javascript:void)", "", "- [ ] task"))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(MarkdownParser.ParseError)
      expect(error).toMatchObject({ _tag: "ParseError", line: 3 })
    }
  })

  it("normalizes line endings in text to \\n", () => {
    expect(parseMarkdown("one\r\ntwo\rthree").blocks).toStrictEqual([
      { _tag: "Paragraph", content: [{ _tag: "Text", value: "one\ntwo\nthree" }] }
    ])
  })
})

describe("parseMarkdownWithFrontmatter", () => {
  const options: MarkdownParser.Options = {
    frontmatter: Schema.Struct({ title: Schema.String, date: Schema.optionalKey(Schema.String) })
  }

  it("extracts validated frontmatter fields, strips surrounding quotes, and returns None when absent", () => {
    const { document, frontmatter } = parseMarkdownWithFrontmatter(
      lines("---", "title: \"Colons: allowed\"", "date: 2026-08-01", "---", "", "Prose."),
      options
    )

    expect(frontmatter).toStrictEqual(Option.some({ title: "Colons: allowed", date: "2026-08-01" }))
    expect(document.blocks.map((block) => block._tag)).toStrictEqual(["Paragraph"])
    expect(parseMarkdownWithFrontmatter("# Title", options).frontmatter).toStrictEqual(Option.none())
  })

  it("rejects entries that are not flat key: value pairs", () => {
    expect(() => parseMarkdownWithFrontmatter(lines("---", "tags:", "  - one", "---"), options)).toThrowError(
      /flat `key: value` pairs/
    )
  })

  it("parses field names shared with Object.prototype members", () => {
    const { frontmatter } = parseMarkdownWithFrontmatter(lines("---", "toString: yes", "---"), {
      frontmatter: Schema.Struct({ toString: Schema.String })
    })

    expect(frontmatter).toStrictEqual(Option.some({ toString: "yes" }))
  })

  it("rejects duplicate fields", () => {
    expect(() => parseMarkdownWithFrontmatter(lines("---", "title: One", "title: Two", "---"), options)).toThrowError(
      /Duplicate frontmatter field "title"/
    )
  })

  it("rejects fields outside the schema, naming the offending line", () => {
    expect(() => parseMarkdownWithFrontmatter(lines("---", "title: My Post", "author: Devin", "---"), options))
      .toThrowError(/Unknown frontmatter field "author" \(line 3\)\. Allowed fields: title, date\./)
  })

  it("rejects frontmatter values that fail the schema or miss required fields", () => {
    const strict: MarkdownParser.Options = {
      frontmatter: Schema.Struct({ title: Schema.String, count: Schema.NumberFromString.check(Schema.isFinite()) })
    }

    expect(() => parseMarkdownWithFrontmatter(lines("---", "title: My Post", "count: not-a-number", "---"), strict))
      .toThrowError(/Invalid frontmatter \(line 3\)/)
    expect(() => parseMarkdownWithFrontmatter(lines("---", "date: 2026-08-01", "---"), options)).toThrowError(
      /Invalid frontmatter/
    )
  })

  it("rejects a non-Struct frontmatter schema", () => {
    const malformed = { frontmatter: Schema.String } as unknown as MarkdownParser.Options

    expect(() => parseMarkdownWithFrontmatter("# Title", malformed)).toThrowError(
      "The `frontmatter` Markdown option must be a Schema struct describing the frontmatter fields."
    )
  })

  it("keeps body line numbers after the frontmatter block", () => {
    expect(() => parseMarkdownWithFrontmatter(lines("---", "title: Post", "---", "", "<br>"), options)).toThrowError(
      /\(line 5\)/
    )
  })
})
