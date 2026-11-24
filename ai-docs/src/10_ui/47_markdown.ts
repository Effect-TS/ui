/**
 * @title Markdown content
 *
 * Write pages in Markdown, compile them at build time with the Vite plugin
 * from `@effect/ui/html/MarkdownVite`, and render them with `Markdown.view`,
 * with components in the prose as islands.
 */
/// <reference types="@effect/ui/html/MarkdownContent" />
import { Component } from "@effect/ui"
import { Html, Markdown, MarkdownParser } from "@effect/ui/html"
import { markdown } from "@effect/ui/html/MarkdownVite"
import { Effect, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import guide, { frontmatter } from "./fixtures/guides/getting-started.md"
import { ActivityLog } from "./fixtures/notes/components/ActivityLog.ts"
import { NoteActivity } from "./fixtures/notes/components/NoteActivity.ts"

// ---------------------------------------------------------------------------
// One vocabulary for the build and the view
// ---------------------------------------------------------------------------

// An island is a component placed in the prose with a directive:
// `::Name{attribute="value"}` on its own line, or
// `:::Name{attribute="value"}` ... `:::` around Markdown that it wraps.
// Each island's attributes are a `Schema.Struct` of strings, or of Schemas
// decoding from a string. Keep the definitions in their own module: the Vite
// config imports them to check the source, and the page imports them to
// decode the attributes it renders.
export const GuideIslands = {
  Callout: Schema.Struct({ tone: Schema.Literals(["tip", "warning"]) }),
  NoteActivity: Schema.Struct({ note: Schema.String })
}

// Frontmatter is flat `key: value` lines between `---` fences, checked
// against a struct. A file without frontmatter still builds; a field the
// struct doesn't know fails the build.
export const GuideFrontmatter = Schema.Struct({
  title: Schema.String,
  summary: Schema.optionalKey(Schema.String)
})

// ---------------------------------------------------------------------------
// Compiling Markdown at build time
// ---------------------------------------------------------------------------

// In `vite.config.ts`: `export default { plugins: [guides] }`. The plugin
// parses every imported `.md` file while Vite builds, so no parser ships to
// the browser. Source outside the vocabulary fails the build with its line:
// raw HTML, reference-style links, a `javascript:` URL, an unknown island,
// or an attribute its schema rejects. The plugin is typed structurally, so
// `@effect/ui` doesn't depend on `vite`.
export const guides = markdown({
  islands: GuideIslands,
  frontmatter: GuideFrontmatter
})

// ---------------------------------------------------------------------------
// Rendering a page with islands
// ---------------------------------------------------------------------------

// The `/// <reference types="@effect/ui/html/MarkdownContent" />` at the top
// types `*.md` imports; adding it to `compilerOptions.types` does the same
// for the whole project. A module's default export is the encoded document,
// plain JSON, and `frontmatter` holds the checked fields.
// `decodeDocument` turns it into the document `view` renders. It caches
// by module, so calling it in `view` decodes once.
export const GuidePageNoDeps = Component.define({
  name: "GuidePage",
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) =>
    h.article(
      h.h1(frontmatter?.title ?? "Guide"),
      Markdown.view(h, Markdown.decodeDocument(guide), {
        // A view replaces one node's rendering. Every other node keeps its
        // unstyled semantic element from `Markdown.defaultViews`.
        views: {
          CodeBlock: (h, { language, value }) =>
            h.pre.attr(
              "data-language",
              language._tag === "Some" ? language.value : "text"
            )
              .children(h.code.children(value))
        },
        // `islandsFor` needs a view for every definition, and each view
        // gets its attributes decoded through the island's schema. A
        // directive the page has no view for renders nothing and warns once.
        islands: Markdown.islandsFor(GuideIslands, {
          // A container island gets its rendered Markdown as `content`.
          Callout: (h, { tone }, content) =>
            h.aside.attr("data-tone", tone).children(content),
          // Islands are ordinary children, so they keep their own state and
          // their services surface on this page. The last argument counts
          // this island's earlier occurrences in the document, which keys
          // two islands of one name apart.
          NoteActivity: (h, { note }, _content, occurrence) =>
            NoteActivity.render(h, {
              key: `activity-${occurrence}`,
              props: { noteId: note },
              fallback: (result) =>
                h.p(
                  AsyncResult.isInitial(result)
                    ? "Loading activity…"
                    : "No activity."
                )
            })
        })
      })
    )
})

// `GuidePageNoDeps` requires `NoteActivity`, from the island, as it would
// from any child. Provide it as usual.
export const GuidePage = GuidePageNoDeps.pipe(
  Component.provide(NoteActivity.toLayer(ActivityLog))
)

// ---------------------------------------------------------------------------
// Parsing Markdown at runtime
// ---------------------------------------------------------------------------

// Markdown that isn't known at build time, such as a note's body, goes
// through the same parser with `MarkdownParser.parseMarkdown`, on the
// server or in the browser. It throws a `ParseError` with the line of the
// first construct outside the vocabulary, so wrap it where users write the
// source. Without `islands`, any `::Name` builds, and a page with no view
// for it renders nothing there. Options that aren't island and frontmatter
// structs throw a plain `Error` before any source is read, so they show up
// while you write the call, and every failure a body can cause is a
// `ParseError`.
export const parseNoteBody = (body: string) =>
  Effect.try({
    try: () => MarkdownParser.parseMarkdown(body, { islands: GuideIslands }),
    catch: (error) => error as MarkdownParser.ParseError
  })
