import type { Preview } from "#domain/Preview"
import { type Fold, Snippet, type Token } from "#domain/Snippet"
import { Component, UiSchema, type View } from "@effect/ui"
import { Collapsible } from "@effect/ui-kit"
import { Html, HtmlCommand } from "@effect/ui/html"
import { Schema } from "effect"

const Line = <M>(
  h: Html.H<M>,
  tokens: ReadonlyArray<Token>,
  index: number
) =>
  h.span.key(String(index)).class("block px-3.5").children(
    tokens.map((token) =>
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

const body = "py-3 text-code [font-variant-ligatures:none]"
const wrapped = "wrap-anywhere whitespace-pre-wrap"

const Body = <M>(
  h: Html.H<M>,
  lines: ReadonlyArray<View.Content<M>>
) => h.pre.class(body, wrapped).children(h.code.children(lines))

// A run of lines in a file with folds. An empty run draws nothing.
const Run = <M>(
  h: Html.H<M>,
  key: string,
  lines: ReadonlyArray<View.Content<M>>
) =>
  lines.length > 0 &&
  h.pre.key(key).class(wrapped).children(h.code.children(lines))

const Window = <M>(
  h: Html.H<M>,
  name: string,
  demo: View.Input<M>,
  body: View.Content<M>
) =>
  h.div.class(
    // Clipped, not hidden: a hidden overflow would stop the pinned
    // button of an open file from following the page.
    "code-window relative overflow-clip rounded-lg border",
    "border-border"
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
      demo,
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
    // The folds are buttons between runs of code, so the file is
    // several pre elements rather than one.
    return h.div.class(body, "font-mono").children(
      folds.flatMap((fold, index) => [
        Run(
          h,
          `run-${index}`,
          Lines(h, lines, folds[index - 1]?.end ?? 0, fold.start)
        ),
        Collapsible(h, {
          key: `fold-${index}`,
          props: { open: model.expanded.includes(index) },
          onEmit: {
            Toggled: () => CodeWindowMessage.ClickedFold({ index }),
            Settled: () => undefined
          },
          view: (collapsible) =>
            collapsible.root(h.div).children(
              collapsible.trigger(
                h.button.attr(
                  "aria-label",
                  `${fold.label} body, ${count(fold)}`
                ).style({
                  "--indent": `${indent(lines[fold.start])}ch`
                }).class(
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
                )
              ).children(count(fold)),
              collapsible.panel(h.div)?.children(
                Run(
                  h,
                  "body",
                  Lines(h, lines, fold.start, fold.end)
                )
              )
            )
        })
      ]),
      Run(
        h,
        "rest",
        Lines(h, lines, folds.at(-1)?.end ?? 0, lines.length)
      )
    )
  }
})

export const CodePreviewMessage = UiSchema.TaggedEnum({
  Toggled: { isOpen: Schema.Boolean }
})

const Top = Html.ref("CodePreview.top", "span")

const pill = [
  "cursor-pointer rounded-full border border-border-strong",
  "bg-background px-3.5 py-1 font-sans text-control font-medium",
  "font-features-[normal] hover:border-foreground",
  "motion-safe:transition-[border-color] motion-safe:duration-150"
].join(" ")

/**
 * A long file that starts collapsed to a preview: the lines from
 * `start` to `end`. The rest stays in the page, hidden until the
 * browser's find-in-page matches it, which opens the file.
 */
export const CodePreview = Html.component({
  name: "CodePreview",
  props: Schema.Struct({
    snippet: Snippet,
    start: Schema.Number,
    end: Schema.Number
  }),
  model: Schema.Struct({ isOpen: Schema.Boolean }),
  message: CodePreviewMessage
}).make({
  init: () => ({ isOpen: false }),
  update: {
    Toggled: ($, { isOpen }) => {
      const next = $.evolve({ isOpen })
      // Closing a long file from its end would leave the reader far
      // below it, so bring its top back into view.
      return isOpen ? next : next.run(
        HtmlCommand.scrollIntoView(Top, () => Component.noop, {
          block: "nearest"
        })
      )
    }
  },
  view: (h, model) => {
    const { end, snippet: { lines }, start } = h.props
    const { isOpen } = model
    const onEmit = {
      Toggled: ({ open }: { readonly open: boolean }) =>
        CodePreviewMessage.Toggled({ isOpen: open }),
      Settled: () => undefined
    }
    const props = { open: isOpen, hiddenUntilFound: true }
    return h.div.class(body, "font-mono").children(
      // At the top of the window, above its file name.
      h.span.ref(Top).class(
        "absolute top-0 scroll-mt-[calc(var(--nav-bar)+1rem)]"
      ),
      start > 0 &&
        Collapsible(h, {
          key: "imports",
          props,
          onEmit,
          view: (collapsible) =>
            collapsible.root(h.div).children(
              collapsible.panel(h.div)?.children(
                Run(h, "lines", Lines(h, lines, 0, start))
              )
            )
        }),
      Run(h, "preview", Lines(h, lines, start, end)),
      Collapsible(h, {
        key: "rest",
        props,
        onEmit,
        view: (collapsible) =>
          collapsible.root(h.div).children(
            collapsible.panel(h.div)?.children(
              Run(h, "lines", Lines(h, lines, end, lines.length))
            ),
            // Closed, the button sits on the last lines of the
            // preview, which fade out under it. Open, it stays
            // pinned to the bottom of the screen while the rest of
            // the file is in view.
            h.div.class(
              "flex justify-center",
              isOpen
                ? "pointer-events-none sticky bottom-4 pt-3"
                : "relative -mt-24 h-24 items-end bg-linear-to-b from-transparent to-card to-80%"
            ).children(
              collapsible.trigger(
                h.button.class(
                  pill,
                  isOpen &&
                    "pointer-events-auto [box-shadow:0_2px_10px_var(--color-ring)]"
                )
              ).children(isOpen ? "Hide code" : "Show code")
            )
          )
      })
    )
  }
})

// demo is a running example of the file. It sits in the window,
// between the file name and the code. A file with a preview starts
// collapsed to it, unless it has folds.
export const Code = <M>(
  h: Html.H<M>,
  snippet: Snippet,
  options: {
    readonly demo?: View.Input<M>
    readonly preview?: Preview | undefined
  } = {}
) =>
  Window(
    h,
    snippet.name,
    options.demo,
    snippet.folds.length > 0
      ? CodeWindow(h, { key: snippet.id, props: { snippet } })
      : options.preview === undefined
      ? Body(h, Lines(h, snippet.lines, 0, snippet.lines.length))
      : CodePreview(h, {
        key: snippet.id,
        props: {
          snippet,
          ...options.preview
        }
      })
  )
