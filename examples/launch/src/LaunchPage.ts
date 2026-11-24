/// <reference types="@effect/ui/html/MarkdownContent" />
import { Code } from "#components/Code"
import { Islands } from "#domain/Island"
import { fromDocument, fromHeading } from "#domain/Section"
import { type Snippet, Snippets } from "#domain/Snippet"
import { Component, Head, type View } from "@effect/ui"
import { Html, Markdown } from "@effect/ui/html"
import { Schema } from "effect"
import source, { frontmatter } from "./article.md"
import { Counter } from "./autocounter/Counter.ts"
import { Diagram } from "./diagram/Diagram.ts"
import { Nav } from "./nav/Nav.ts"
import { AllResults, PerformanceChart } from "./performance/Chart.ts"

const article = Markdown.decodeDocument(source)

const sections = fromDocument(article)

const title = frontmatter?.title ?? ""

const Files = <M>(h: View.H<M>, files: ReadonlyArray<Snippet>) =>
  files.map((snippet) =>
    h.div.key(snippet.name).children(Code(h, snippet))
  )

const Example = <M>(
  h: View.H<M>,
  title: string,
  files: ReadonlyArray<Snippet>
) =>
  h.section.class("example").attr("aria-label", title).children(
    h.p.class("example-title").children(title),
    h.div.class("example-body").children(...Files(h, files))
  )

const Caption = <M>(
  h: View.H<M>,
  content: ReadonlyArray<View.Content<M>>
) =>
  content.length > 0 &&
  h.figcaption.class("caption").children(content)

export const LaunchPage = Component.define({
  name: "LaunchPage",
  scoped: false,
  props: Schema.Struct({ snippets: Snippets }),
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  head: () => [Head.title(title)],
  view: (h) => {
    const { snippets } = h.props
    return h.div.class("nav-layout").children(
      Nav(h, { props: { sections } }),
      h.main.class("article").children(
        h.h1.children(title),
        Markdown.viewBlocks(h, article, {
          views: {
            Heading: (h, heading, content) => {
              const { id, isNested } = fromHeading(heading)
              return isNested
                ? h.h3.id(id).children(content)
                : h.h2.id(id).children(content)
            }
          },
          islands: Markdown.islandsFor(Islands, {
            Diagram: (h, { scenario }) =>
              Diagram(h, { key: scenario, props: { scenario } }),
            Compare: (h, attributes, caption) =>
              h.figure.class("compare wide").children(
                h.div.class("compare-columns").children(
                  Example(
                    h,
                    attributes.foldkitTitle,
                    snippets[attributes.foldkit]
                  ),
                  Example(
                    h,
                    attributes.effectTitle,
                    snippets[attributes.effect]
                  )
                ),
                Caption(h, caption)
              ),
            Counter: (h, { code, label }, caption, occurrence) =>
              h.figure.class("beside wide").children(
                h.div.class("beside-columns").children(
                  h.div.class("beside-code").children(
                    ...Files(h, snippets[code])
                  ),
                  h.div.class("demo beside-demo").attr(
                    "role",
                    "group"
                  )
                    .attr("aria-label", label).children(
                      Counter(h, { key: `counter-${occurrence}` })
                    )
                ),
                Caption(h, caption)
              ),
            Listing: (h, { code }, caption) =>
              h.figure.class("listing wide").children(
                ...Files(h, snippets[code]),
                Caption(h, caption)
              ),
            PerformanceChart: (h) => PerformanceChart(h),
            AllResults: (h) => AllResults(h),
            Footer: (h, _attributes, content) =>
              h.footer.class("footer").children(content)
          })
        })
      )
    )
  }
})
