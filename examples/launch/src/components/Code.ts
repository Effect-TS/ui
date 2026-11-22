import type { Snippet, Token } from "#domain/Snippet"
import type { View } from "@effect/ui"

const Line = <M>(h: View.H<M>, tokens: ReadonlyArray<Token>, index: number, lit: boolean) =>
  h.span.key(String(index)).class("line", lit && "lit").children(
    ...tokens.map((token) => h.span.style({ color: token.color }).children(token.text)),
    "\n"
  )

export const Code = <M>(h: View.H<M>, options: {
  readonly snippet: Snippet
  readonly lit: number
}) =>
  h.div.class("code-frame").children(
    h.p.class("code-tab").children(options.snippet.name),
    h.pre.class("code").children(
      h.code.children(
        ...options.snippet.lines.map((tokens, index) => h.lazy(Line, tokens, index, index === options.lit))
      )
    )
  )
