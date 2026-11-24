import type { Snippet, Token } from "#domain/Snippet"
import type { View } from "@effect/ui"

const Line = <M>(
  h: View.H<M>,
  tokens: ReadonlyArray<Token>,
  index: number
) =>
  h.span.key(String(index)).class("block px-3.5").children(
    ...tokens.map((token) =>
      h.span.style({ color: token.color }).children(token.text)
    ),
    "\n"
  )

export const Code = <M>(h: View.H<M>, snippet: Snippet) =>
  h.div.class(
    "code-window overflow-hidden rounded-lg border border-border"
  )
    .children(
      h.p.class(
        "flex items-center justify-between gap-3 border-b border-border bg-muted px-3.5 py-2.5",
        "font-mono text-[12px]/[normal] text-pretty",
        "text-muted-foreground font-features-[normal]"
      ).children(
        h.span.class("text-foreground").children(snippet.name),
        h.span.class("text-[10px] tracking-widest uppercase")
          .children("TypeScript")
      ),
      h.pre.class(
        "py-3 text-code wrap-anywhere whitespace-pre-wrap",
        "[font-variant-ligatures:none]"
      ).children(
        h.code.children(
          ...snippet.lines.map((tokens, index) =>
            h.lazy(Line, tokens, index)
          )
        )
      )
    )
