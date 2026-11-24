import { type Fold, Snippet, type Token } from "#domain/Snippet"
import { UiSchema, type View } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const Line = <M>(
  h: Html.H<M>,
  tokens: ReadonlyArray<Token>,
  index: number
) =>
  h.span.key(String(index)).class("block px-3.5").children(
    ...tokens.map((token) =>
      h.span.style({ color: token.color }).children(token.text)
    ),
    "\n"
  )

const Lines = <M>(
  h: Html.H<M>,
  lines: Snippet["lines"],
  start: number,
  end: number
) =>
  lines.slice(start, end).map((tokens, offset) =>
    h.lazy(Line, tokens, start + offset)
  )

const Body = <M>(
  h: Html.H<M>,
  lines: ReadonlyArray<View.Content<M>>
) =>
  h.pre.class(
    "py-3 text-code wrap-anywhere whitespace-pre-wrap",
    "[font-variant-ligatures:none]"
  ).children(h.code.children(...lines))

const Window = <M>(
  h: Html.H<M>,
  name: string,
  demo: ReadonlyArray<View.Content<M>>,
  body: View.Content<M>
) =>
  h.div.class(
    "code-window overflow-hidden rounded-lg border border-border"
  )
    .children(
      h.p.class(
        "flex items-center justify-between gap-3 border-b border-border bg-muted px-3.5 py-2.5",
        "font-mono text-[12px]/[normal] text-pretty",
        "text-muted-foreground font-features-[normal]"
      ).children(
        h.span.class("text-foreground").children(name),
        h.span.class("text-[10px] tracking-widest uppercase")
          .children("TypeScript")
      ),
      ...demo,
      body
    )

const indent = (tokens: ReadonlyArray<Token>) =>
  Math.max(
    0,
    tokens.map((token) => token.text).join("").search(/\S/)
  )

const count = ({ end, start }: Fold) =>
  end - start === 1 ? "1 line" : `${end - start} lines`

export const CodeWindowMessage = UiSchema.TaggedEnum({
  ClickedFold: { index: Schema.Number }
})

export const CodeWindow = Html.component({
  name: "CodeWindow",
  props: Schema.Struct({ snippet: Snippet }),
  model: Schema.Struct({ expanded: Schema.Array(Schema.Number) }),
  message: CodeWindowMessage
}).make({
  init: () => ({ expanded: [] }),
  update: {
    ClickedFold: ($, { index }) =>
      $.evolve({
        expanded: (expanded) =>
          expanded.includes(index)
            ? expanded.filter((other) => other !== index)
            : [...expanded, index]
      })
  },
  view: (h, model) => {
    const { folds, lines } = h.props.snippet
    return Body(h, [
      ...folds.flatMap((fold, index) => {
        const isExpanded = model.expanded.includes(index)
        const body = h.id("fold", index)
        return [
          ...Lines(h, lines, folds[index - 1]?.end ?? 0, fold.start),
          Button(h, {
            onPress: CodeWindowMessage.ClickedFold({ index })
          }).key(`fold-${index}`).attrs({
            "aria-expanded": String(isExpanded),
            "aria-controls": body,
            "aria-label": `${fold.label} body, ${count(fold)}`
          }).style({ "--indent": `${indent(lines[fold.start])}ch` })
            .class(
              "flex w-full cursor-pointer items-center gap-1.5",
              "ps-[calc(0.875rem+var(--indent))] pe-3.5 text-start",
              "text-muted-foreground select-none",
              "hover:bg-muted hover:text-foreground",
              "aria-[expanded=false]:bg-muted",
              "aria-[expanded=false]:hover:bg-border",
              "focus-visible:-outline-offset-2",
              "before:size-3.5 before:flex-none before:bg-current",
              "before:content-['']",
              "before:[mask:var(--icon-chevron)_center/contain_no-repeat]",
              "before:transform-[rotate(-90deg)]",
              "aria-expanded:before:transform-none",
              "motion-safe:before:transition-[transform]",
              "motion-safe:before:duration-150"
            ).children(count(fold)),
          h.span.key(`body-${index}`).id(body).class("block")
            .children(
              ...(isExpanded
                ? Lines(h, lines, fold.start, fold.end)
                : [])
            )
        ]
      }),
      ...Lines(h, lines, folds.at(-1)?.end ?? 0, lines.length)
    ])
  }
})

// demo is a running example of the file. It sits in the window,
// between the file name and the code.
export const Code = <M>(
  h: Html.H<M>,
  snippet: Snippet,
  demo: ReadonlyArray<View.Content<M>> = []
) =>
  Window(
    h,
    snippet.name,
    demo,
    snippet.folds.length === 0
      ? Body(h, Lines(h, snippet.lines, 0, snippet.lines.length))
      : CodeWindow(h, { key: snippet.id, props: { snippet } })
  )
