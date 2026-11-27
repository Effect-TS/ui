import { caption } from "#components/Classes"
import { Code } from "#components/Code"
import * as Preview from "#domain/Preview"
import { type Snippet, textOf } from "#domain/Snippet"
import type { View } from "@effect/ui"
import type { Html } from "@effect/ui/html"

const listing = [
  "mx-auto max-w-(--column)",
  "my-10 flex flex-col gap-3 [p+&]:mt-[1.1em]"
].join(" ")

// A long file starts collapsed to a preview.
export const previewOf = (snippet: Snippet) =>
  Preview.of(textOf(snippet))

// The app a listing's code builds, running above the code.
const Example = <M>(h: Html.H<M>, app: View.Content<M>) =>
  h.div.class(
    "code-window overflow-clip rounded-lg border border-border"
  ).attrs({
    role: "group",
    "aria-label": "The app, running"
  }).children(
    h.p.class(
      "flex items-center justify-between gap-3 border-b",
      "border-border bg-muted px-3.5 py-2 font-mono",
      "text-[12px]/[normal] text-muted-foreground",
      "font-features-[normal]"
    ).children(
      h.span.class("text-foreground").children("The app"),
      h.span.class("text-[10px] tracking-widest uppercase").children(
        "Live"
      )
    ),
    h.div.class("live-demo bg-background px-4 py-4").children(app)
  )

export const Listing = <M>(
  h: Html.H<M>,
  options: {
    readonly files: ReadonlyArray<Snippet>
    readonly example?: View.Content<M> | false | undefined
    readonly whole?: boolean | undefined
    readonly caption?: ReadonlyArray<View.Content<M>> | undefined
  }
) => {
  const previews = options.whole ? [] : options.files.map(previewOf)
  return h.figure.class(listing).children(
    options.example && Example(h, options.example),
    options.files.map((snippet, index) =>
      h.div.key(snippet.name).children(
        Code(h, snippet, { preview: previews[index] })
      )
    ),
    options.caption && options.caption.length > 0 &&
      h.figcaption.class(caption).children(options.caption)
  )
}
