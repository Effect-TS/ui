declare module "virtual:snippets" {
  import type { Snippet } from "#domain/Snippet"
  export const effect: Snippet
  export const foldkit: ReadonlyArray<Snippet>
  export const provider: { readonly foldkit: ReadonlyArray<Snippet>; readonly effect: ReadonlyArray<Snippet> }
}
