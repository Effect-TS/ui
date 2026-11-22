import type { Snippet } from "#domain/Snippet"
import type { View } from "@effect/ui"

export const Code = <M>(h: View.H<M>, options: {
  readonly snippet: Snippet
  readonly lit: number | undefined
}) =>
  h.div.class("code-frame").children(
    h.p.class("code-tab").children(options.snippet.name),
    h.pre.class("code").children(
      h.code.children(
        ...options.snippet.lines.map((line, index) =>
          h.span.key(String(index)).class("line", index === options.lit && "lit").children(
            ...line.map((token) => h.span.style({ "--light": token.light, "--dark": token.dark }).children(token.text)),
            "\n"
          )
        )
      )
    )
  )
