declare module "virtual:snippets" {
  import type { Pair, Snippet } from "#domain/Snippet"
  export const counter: Pair
  export const provider: Pair
  export const kept: ReadonlyArray<Snippet>
}
