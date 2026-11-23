import { Markdown, MarkdownParser } from "@effect/ui/html"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"

const { parseMarkdown, parseMarkdownWithFrontmatter } = MarkdownParser

const lines = (...sourceLines: ReadonlyArray<string>): string => sourceLines.join("\n")

describe("parseMarkdown", () => {
  it("parses the core block vocabulary in document order", () => {
    const document = parseMarkdown(
      lines(
        "# Title",
        "",
        "A paragraph.",
        "",
        "> Quoted.",
        "",
        "- one",
        "- two",
        "",
        "---",
        "",
        "~~~ts twoslash",
        "const count = 1",
        "~~~"
      )
    )

    expect(document.blocks.map((block) => block._tag)).toStrictEqual([
      "Heading",
      "Paragraph",
      "Blockquote",
      "List",
      "ThematicBreak",
      "CodeBlock"
    ])
  })

  it("parses headings with their level and inline content", () => {
    expect(parseMarkdown("## Two words").blocks).toStrictEqual([
      { _tag: "Heading", level: 2, content: [{ _tag: "Text", value: "Two words" }] }
    ])
  })

  it("parses nested inline content", () => {
    const document = parseMarkdown(
      "Some *emphasis with `code`*, **strength**, ~~loss~~, and a [link](https://example.com \"Example\")."
    )

    expect(document.blocks).toStrictEqual([
      {
        _tag: "Paragraph",
        content: [
          { _tag: "Text", value: "Some " },
          {
            _tag: "Emphasis",
            content: [{ _tag: "Text", value: "emphasis with " }, { _tag: "InlineCode", value: "code" }]
          },
          { _tag: "Text", value: ", " },
          { _tag: "Strong", content: [{ _tag: "Text", value: "strength" }] },
          { _tag: "Text", value: ", " },
          { _tag: "Strikethrough", content: [{ _tag: "Text", value: "loss" }] },
          { _tag: "Text", value: ", and a " },
          {
            _tag: "Link",
            url: "https://example.com",
            title: Option.some("Example"),
            content: [{ _tag: "Text", value: "link" }]
          },
          { _tag: "Text", value: "." }
        ]
      }
    ])
  })

  it("parses images with alt text", () => {
    expect(parseMarkdown("![A film photograph](./photo.jpg)").blocks).toStrictEqual([
      {
        _tag: "Paragraph",
        content: [{ _tag: "Image", url: "./photo.jpg", alt: "A film photograph", title: Option.none() }]
      }
    ])
  })

  it("captures code block language and meta from the opening fence", () => {
    expect(parseMarkdown(lines("~~~ts filename=main.ts", "const count = 1", "~~~")).blocks).toStrictEqual([
      {
        _tag: "CodeBlock",
        language: Option.some("ts"),
        meta: Option.some("filename=main.ts"),
        value: "const count = 1"
      }
    ])
  })

  it("parses nested lists as block content of the parent item", () => {
    const paragraph = (value: string) => ({ _tag: "Paragraph", content: [{ _tag: "Text", value }] })

    expect(parseMarkdown(lines("1. outer", "   - inner one", "   - inner two")).blocks).toStrictEqual([
      {
        _tag: "List",
        isOrdered: true,
        startNumber: Option.some(1),
        items: [
          {
            _tag: "ListItem",
            blocks: [
              paragraph("outer"),
              {
                _tag: "List",
                isOrdered: false,
                startNumber: Option.none(),
                items: [
                  { _tag: "ListItem", blocks: [paragraph("inner one")] },
                  { _tag: "ListItem", blocks: [paragraph("inner two")] }
                ]
              }
            ]
          }
        ]
      }
    ])
  })

  it("parses tables with per-column alignments and a header row", () => {
    const row = (...cells: ReadonlyArray<string>) => ({
      _tag: "TableRow",
      cells: cells.map((value) => ({ _tag: "TableCell", content: [{ _tag: "Text", value }] }))
    })

    expect(
      parseMarkdown(lines("| Stock | Speed |", "| :--- | ---: |", "| Portra | 400 |", "| Ektar | 100 |")).blocks
    ).toStrictEqual([
      {
        _tag: "Table",
        alignments: ["Left", "Right"],
        headerRow: row("Stock", "Speed"),
        bodyRows: [row("Portra", "400"), row("Ektar", "100")]
      }
    ])
  })

  it("parses a leaf directive into an island with attributes and no blocks", () => {
    expect(parseMarkdown("::Counter{label=\"Clicks\"}").blocks).toStrictEqual([
      { _tag: "Island", name: "Counter", attributes: { label: "Clicks" }, blocks: [] }
    ])
  })

  it("parses a container directive into an island with nested blocks", () => {
    expect(parseMarkdown(lines(":::Note", "Nested *prose* inside.", ":::")).blocks).toStrictEqual([
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

  it("accepts declared islands and validates their attributes", () => {
    const document = parseMarkdown("::Counter{label=\"Clicks\"}", {
      islands: { Counter: Schema.Struct({ label: Schema.optionalKey(Schema.String) }) }
    })

    expect(document.blocks.map((block) => block._tag)).toStrictEqual(["Island"])
  })

  it("rejects non-schema island definitions from untyped callers", () => {
    const malformed = { islands: { Counter: ["label"] } } as unknown as MarkdownParser.Options

    expect(() => parseMarkdown("::Counter", malformed)).toThrowError(
      "Island \"Counter\" in the Markdown options must map to a Schema struct describing its attributes."
    )
  })

  it("rejects island names missing from the declared islands", () => {
    expect(() => parseMarkdown("::Conuter", { islands: { Counter: Schema.Struct({}), Note: Schema.Struct({}) } }))
      .toThrowError("Unknown island \"Conuter\" (line 1). Allowed islands: Counter, Note.")
  })

  it("rejects attributes missing from the island schema", () => {
    expect(() =>
      parseMarkdown("::Counter{labl=\"Clicks\"}", {
        islands: { Counter: Schema.Struct({ label: Schema.optionalKey(Schema.String) }) }
      })
    ).toThrowError("Unknown attribute \"labl\" for island \"Counter\" (line 1). Allowed attributes: label.")
  })

  it("rejects attributes on islands that declare none", () => {
    expect(() =>
      parseMarkdown(lines(":::Note{tone=\"calm\"}", "Prose.", ":::"), { islands: { Note: Schema.Struct({}) } })
    )
      .toThrowError("Unknown attribute \"tone\" for island \"Note\" (line 1). It takes no attributes.")
  })

  it("rejects attribute values outside the island schema", () => {
    expect(() => parseMarkdown("::Counter", { islands: { Counter: Schema.Struct({ label: Schema.String }) } }))
      .toThrowError(/Invalid attributes for island "Counter" \(line 1\)/)
  })

  it("rejects raw HTML blocks", () => {
    expect(() => parseMarkdown("<div>raw</div>")).toThrowError(/Unsupported markdown node "html" \(line 1\)/)
  })

  it("rejects raw inline HTML", () => {
    expect(() => parseMarkdown("Some <em>raw</em> HTML.")).toThrowError(/Unsupported markdown node "html"/)
  })

  it("rejects reference-style links", () => {
    expect(() => parseMarkdown(lines("See [the docs][docs].", "", "[docs]: https://example.com"))).toThrowError(
      /Reference-style links are not supported/
    )
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

  it("rejects non-Struct island schemas", () => {
    const malformed = { islands: { Counter: Schema.String } } as unknown as MarkdownParser.Options

    expect(() => parseMarkdown("::Counter", malformed)).toThrowError(
      "Island \"Counter\" in the Markdown options must map to a Schema struct describing its attributes."
    )
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

  it("turns line endings inside code spans into spaces, as CommonMark does", () => {
    expect(parseMarkdown("`one\ntwo`").blocks).toStrictEqual([
      { _tag: "Paragraph", content: [{ _tag: "InlineCode", value: "one two" }] }
    ])
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

  it("extracts validated frontmatter fields and drops the block from the document", () => {
    const { document, frontmatter } = parseMarkdownWithFrontmatter(
      lines("---", "title: My Post", "date: 2026-08-01", "---", "", "Prose."),
      options
    )

    expect(frontmatter).toStrictEqual(Option.some({ title: "My Post", date: "2026-08-01" }))
    expect(document.blocks.map((block) => block._tag)).toStrictEqual(["Paragraph"])
  })

  it("strips matching surrounding quotes from field values", () => {
    const { frontmatter } = parseMarkdownWithFrontmatter(lines("---", "title: \"Colons: allowed\"", "---"), options)

    expect(frontmatter).toStrictEqual(Option.some({ title: "Colons: allowed" }))
  })

  it("returns no frontmatter for a document without a block", () => {
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

  it("rejects values the schema does not accept, naming the offending line", () => {
    const strict: MarkdownParser.Options = {
      frontmatter: Schema.Struct({ title: Schema.String, count: Schema.NumberFromString.check(Schema.isFinite()) })
    }

    expect(() => parseMarkdownWithFrontmatter(lines("---", "title: My Post", "count: not-a-number", "---"), strict))
      .toThrowError(/Invalid frontmatter \(line 3\)/)
  })

  it("rejects a document missing required fields", () => {
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
