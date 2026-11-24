/**
 * Parses Markdown source into a `Markdown.Document`, with no dependencies.
 *
 * The parser follows CommonMark and adds GFM tables, strikethrough and
 * autolinks, and `::Name` and `:::Name` island directives. Anything
 * outside the `Markdown` vocabulary fails with the construct and its line:
 * raw HTML, reference links and images, footnotes, task lists, inline
 * directives, leaf directive labels, and URLs that fail
 * `Markdown.isAllowedUrl`. A bare `:name` in prose, such as `10:30`, is
 * text.
 *
 * It is a pure function of a string, so it runs in a build, a script, a
 * server or a browser. The Vite plugin in `@effect/ui/html/MarkdownVite`
 * runs it for every `.md` import.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Data from "effect/Data"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import type * as SchemaIssue from "effect/SchemaIssue"
import { parse, unsupported } from "./internal/markdown.ts"
import type * as Markdown from "./Markdown.ts"

/**
 * Markdown source that is outside the vocabulary or fails the options'
 * schemas. `line` is the 1-based line of the problem, and `message` names
 * the construct and the line.
 *
 * @stability experimental
 * @category errors
 * @since 0.1.0
 */
export class ParseError extends Data.TaggedError("ParseError")<{
  readonly message: string
  readonly line: number
}> {}

/**
 * The frontmatter schema: a struct over string fields.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type FrontmatterDefinition = Markdown.IslandDefinition

/**
 * Options for `parseMarkdown`, `parseMarkdownWithFrontmatter` and the Vite
 * plugin.
 *
 * **Details**
 *
 * With `islands`, a directive whose name isn't listed, an attribute its
 * schema doesn't declare, or a value its schema rejects fails the parse.
 * Without it, any island parses.
 *
 * With `frontmatter`, a leading `---` block of flat `key: value` lines is
 * checked against the schema and left out of the document. Without it, a
 * frontmatter block fails the parse.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  readonly islands?: Markdown.IslandDefinitions | undefined
  readonly frontmatter?: FrontmatterDefinition | undefined
}

/**
 * A parsed document and its frontmatter fields, when the source has a
 * frontmatter block and `frontmatter` is set.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Parsed {
  readonly document: Markdown.Document
  readonly frontmatter: Option.Option<Readonly<Record<string, string>>>
}

const isStruct = (value: unknown): boolean =>
  Schema.isSchema(value) && "fields" in value

const checkOptions = (options: Options): Options => {
  for (const [name, schema] of Object.entries(options.islands ?? {})) {
    if (!isStruct(schema)) {
      throw new Error(
        `Island "${name}" in the Markdown options must map to a Schema struct describing its attributes.`
      )
    }
  }
  if (options.frontmatter !== undefined && !isStruct(options.frontmatter)) {
    throw new Error(
      "The `frontmatter` Markdown option must be a Schema struct describing the frontmatter fields."
    )
  }
  return options
}

const fieldName = (issue: SchemaIssue.Issue): string | undefined => {
  const first = issue._tag === "Composite" ? issue.issues[0] : issue
  return first._tag === "Pointer" && typeof first.path[0] === "string"
    ? first.path[0]
    : undefined
}

type FieldProblem =
  | {
    readonly _tag: "Unknown"
    readonly name: string
    readonly allowed: ReadonlyArray<string>
  }
  | {
    readonly _tag: "Invalid"
    readonly name: string | undefined
    readonly detail: string
  }

const checkFields = (
  schema: FrontmatterDefinition,
  values: Readonly<Record<string, string>>
): FieldProblem | undefined => {
  const allowed = Object.keys(schema.fields)
  const unknown = Object.keys(values).find((name) => !allowed.includes(name))
  if (unknown !== undefined) {
    return { _tag: "Unknown", name: unknown, allowed }
  }
  const decoded = Schema.decodeUnknownResult(schema)(values)
  return Result.isFailure(decoded)
    ? {
      _tag: "Invalid",
      name: fieldName(decoded.failure.issue),
      detail: decoded.failure.message
    }
    : undefined
}

const allowedText = (allowed: ReadonlyArray<string>, noun: string): string =>
  allowed.length === 0
    ? `It takes no ${noun}.`
    : `Allowed ${noun}: ${allowed.join(", ")}.`

const islandCheck = (islands: Markdown.IslandDefinitions) =>
(
  name: string,
  attributes: Readonly<Record<string, string>>,
  line: number
): string | undefined => {
  if (!Object.hasOwn(islands, name)) {
    return `Unknown island "${name}" (line ${line}). Allowed islands: ${
      Object.keys(islands).join(", ")
    }.`
  }
  const problem = checkFields(islands[name], attributes)
  if (problem === undefined) {
    return undefined
  }
  return problem._tag === "Unknown"
    ? `Unknown attribute "${problem.name}" for island "${name}" (line ${line}). ${
      allowedText(problem.allowed, "attributes")
    }`
    : `Invalid attributes for island "${name}" (line ${line}). ${problem.detail}`
}

const frontmatterFence = /^---[ \t]*$/

const splitFrontmatter = (
  source: string
): { readonly lines: Array<string>; readonly body: string } | undefined => {
  const lines = source.split(/\r\n|\n|\r/)
  if (!frontmatterFence.test(lines[0])) {
    return undefined
  }
  const end = lines.findIndex((line, index) =>
    index > 0 && frontmatterFence.test(line)
  )
  if (end === -1) {
    return undefined
  }
  return {
    lines: lines.slice(1, end),
    body: "\n".repeat(end + 1) + lines.slice(end + 1).join("\n")
  }
}

const frontmatterEntry = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/

const unquote = (value: string): string =>
  value.length >= 2 && (value[0] === "\"" || value[0] === "'") &&
    value.endsWith(value[0])
    ? value.slice(1, -1)
    : value

const parseFrontmatter = (
  lines: ReadonlyArray<string>,
  schema: FrontmatterDefinition
): Readonly<Record<string, string>> => {
  const fields = new Map<string, string>()
  const fieldLines = new Map<string, number>()
  lines.forEach((text, index) => {
    if (text.trim() === "") {
      return
    }
    const line = index + 2
    const entry = frontmatterEntry.exec(text)
    if (entry === null) {
      throw new ParseError({
        line,
        message:
          `Invalid frontmatter entry (line ${line}). Frontmatter supports flat \`key: value\` pairs of strings only. Nesting, lists, and multi-line values are not supported.`
      })
    }
    if (fields.has(entry[1])) {
      throw new ParseError({
        line,
        message: `Duplicate frontmatter field "${entry[1]}" (line ${line}).`
      })
    }
    fields.set(entry[1], unquote(entry[2].trim()))
    fieldLines.set(entry[1], line)
  })
  const values = Object.fromEntries(fields)
  const problem = checkFields(schema, values)
  if (problem !== undefined) {
    const line =
      (problem.name === undefined ? undefined : fieldLines.get(problem.name)) ??
        1
    throw new ParseError({
      line,
      message: problem._tag === "Unknown"
        ? `Unknown frontmatter field "${problem.name}" (line ${line}). ${
          allowedText(problem.allowed, "fields")
        }`
        : `Invalid frontmatter (line ${line}). ${problem.detail}`
    })
  }
  return values
}

/**
 * Parses Markdown source into a document and its frontmatter fields.
 * Throws a `ParseError` on anything outside the vocabulary.
 *
 * **Details**
 *
 * The fields are the strings the block declares, already checked against
 * `options.frontmatter`, so decoding them with that schema succeeds.
 *
 * @stability experimental
 * @category parsing
 * @since 0.1.0
 */
export const parseMarkdownWithFrontmatter = (
  input: string,
  options: Options = {}
): Parsed => {
  const { frontmatter, islands } = checkOptions(options)
  const source = input.replace(/^\uFEFF/, "")
  const split = splitFrontmatter(source)
  if (split !== undefined && frontmatter === undefined) {
    throw new ParseError({ line: 1, message: unsupported("yaml", 1) })
  }
  const fields = split === undefined || frontmatter === undefined
    ? Option.none()
    : Option.some(parseFrontmatter(split.lines, frontmatter))
  const result = parse(split?.body ?? source, {
    island: islands === undefined ? undefined : islandCheck(islands)
  })
  if (Result.isFailure(result)) {
    throw new ParseError({
      line: result.failure.line,
      message: result.failure.message
    })
  }
  return { document: result.success, frontmatter: fields }
}

/**
 * Parses Markdown source into a document. Throws a `ParseError` on anything
 * outside the vocabulary, and on frontmatter or islands that fail
 * `options`. A frontmatter block is checked and dropped; use
 * `parseMarkdownWithFrontmatter` to read it.
 *
 * **Example** (Parsing a post)
 *
 * ```ts import.meta.vitest
 * import { MarkdownParser } from "@effect/ui/html"
 *
 * const document = MarkdownParser.parseMarkdown("# Hello\n\nSome *prose*.")
 *
 * document.blocks.map((block) => block._tag) // => ["Heading", "Paragraph"]
 * ```
 *
 * @stability experimental
 * @category parsing
 * @since 0.1.0
 */
export const parseMarkdown = (
  source: string,
  options?: Options
): Markdown.Document => parseMarkdownWithFrontmatter(source, options).document
