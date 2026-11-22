import { Schema } from "effect"

export const Token = Schema.Struct({
  text: Schema.String,
  light: Schema.String,
  dark: Schema.String
})
export type Token = typeof Token.Type

export const Snippet = Schema.Struct({
  name: Schema.String,
  lines: Schema.Array(Schema.Array(Token))
})
export type Snippet = typeof Snippet.Type

export const lineText = (line: ReadonlyArray<Token>): string => line.map((token) => token.text).join("")

export const countLines = (snippets: ReadonlyArray<Snippet>): number =>
  snippets.reduce((total, snippet) => total + snippet.lines.filter((line) => lineText(line).trim() !== "").length, 0)

export const findLine = (
  snippets: ReadonlyArray<Snippet>,
  marker: string
): readonly [name: string, line: number] | undefined => {
  if (marker === "") return undefined
  for (const snippet of snippets) {
    const line = snippet.lines.findIndex((tokens) => lineText(tokens).includes(marker))
    if (line >= 0) return [snippet.name, line]
  }
  return undefined
}
