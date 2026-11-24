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

const Files = Schema.Array(Snippet)

export const Snippets = Schema.Struct({
  intro: Files,
  split: Files,
  counterFoldkit: Files,
  counterEffect: Files,
  queryFoldkit: Files,
  queryEffect: Files,
  storyFoldkit: Files,
  storyEffect: Files,
  sceneFoldkit: Files,
  sceneEffect: Files,
  play: Files,
  partsFoldkit: Files,
  partsEffect: Files,
  partsOwn: Files,
  mount: Files,
  provider: Files
})
export type Snippets = typeof Snippets.Type
