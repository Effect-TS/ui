import { Schema } from "effect"

export const Token = Schema.Struct({
  text: Schema.String,
  color: Schema.String
})
export type Token = typeof Token.Type

export const Snippet = Schema.Struct({
  name: Schema.String,
  lines: Schema.Array(Schema.Array(Token))
})
export type Snippet = typeof Snippet.Type

const lineText = (line: ReadonlyArray<Token>): string => line.map((token) => token.text).join("")

export const countLines = (snippets: ReadonlyArray<Snippet>): number =>
  snippets.reduce((total, snippet) => total + snippet.lines.filter((line) => lineText(line).trim() !== "").length, 0)

export const lineOf = (snippet: Snippet, marker: string | undefined): number =>
  marker === undefined ? -1 : snippet.lines.findIndex((line) => lineText(line).includes(marker))
