import { Schema } from "effect"

export const Token = Schema.Struct({
  text: Schema.String,
  color: Schema.String
})
export type Token = typeof Token.Type

export const Fold = Schema.Struct({
  label: Schema.String,
  start: Schema.Number,
  end: Schema.Number
})
export type Fold = typeof Fold.Type

export const Snippet = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  lines: Schema.Array(Schema.Array(Token)),
  folds: Schema.Array(Fold)
})
export type Snippet = typeof Snippet.Type

// A snippet's lines as plain text.
export const textOf = (snippet: Snippet): ReadonlyArray<string> =>
  snippet.lines.map((line) =>
    line.map((token) => token.text).join("")
  )

const Files = Schema.Array(Snippet)

export const Snippets = Schema.Struct({
  intro: Files,
  counter: Files,
  query: Files,
  tests: Files,
  play: Files,
  playSignIn: Files,
  playSnake: Files,
  provider: Files
})
export type Snippets = typeof Snippets.Type
