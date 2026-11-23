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

export const Pair = Schema.Struct({
  foldkit: Schema.Array(Snippet),
  effect: Schema.Array(Snippet)
})
export type Pair = typeof Pair.Type
