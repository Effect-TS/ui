/// <reference types="@effect/ui/html/MarkdownContent" />
import { caption, wide } from "#components/Classes"
import { Code } from "#components/Code"
import { Islands } from "#domain/Island"
import { fromDocument, fromHeading } from "#domain/Section"
import { type Snippet, Snippets } from "#domain/Snippet"
import { Component, Head, type View } from "@effect/ui"
import { Html, Markdown } from "@effect/ui/html"
import { Option, Schema } from "effect"
import source, { frontmatter } from "./article.md"
import { Counter } from "./autocounter/Counter.ts"
import { Diagram } from "./diagram/Diagram.ts"
import { Nav } from "./nav/Nav.ts"
import { AllResults, PerformanceChart } from "./performance/Chart.ts"
import { PlayTest } from "./playtest/PlayTest.ts"
import { AgentPrompt } from "./prompt/AgentPrompt.ts"

const article = Markdown.decodeDocument(source)

const sections = fromDocument(article)

const title = frontmatter?.title ?? ""

const block = "mx-auto max-w-(--column)"

const listing = [
  block,
  "my-10 flex flex-col gap-3 [p+&]:mt-[1.1em]"
].join(" ")

const heading = [
  block,
  "scroll-mt-[calc(var(--nav-bar)+24px)] text-balance font-[620]"
].join(" ")

const Files = <M>(h: View.H<M>, files: ReadonlyArray<Snippet>) =>
  files.map((snippet) =>
    h.div.key(snippet.name).children(Code(h, snippet))
  )

const Example = <M>(
  h: View.H<M>,
  title: string,
  files: ReadonlyArray<Snippet>
) =>
  h.section.class("comparison-side").attr("aria-label", title)
    .children(
      h.p.class("text-[0.9375rem]/[1.4] font-semibold text-pretty")
        .children(title),
      ...Files(h, files)
    )

const Caption = <M>(
  h: View.H<M>,
  content: ReadonlyArray<View.Content<M>>
) =>
  content.length > 0 &&
  h.figcaption.class(caption).children(content)

export const LaunchPage = Component.define({
  name: "LaunchPage",
  props: Schema.Struct({
    snippets: Snippets,
    articleUrl: Schema.String
  }),
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  head: () => [Head.title(title)],
  view: (h) => {
    const { articleUrl, snippets } = h.props
    return h.div.class(
      "[--nav-bar:3rem]",
      "[--nav-inset:max(clamp(20px,5vw,48px),calc((100%-68ch)/2))]",
      "rail:grid rail:[--nav-bar:0px] rail:[--nav-rail:12rem]",
      "rail:[--nav-gutter:48px]",
      "rail:[--nav-article:calc(1180px+2*var(--nav-gutter))]",
      "rail:grid-cols-[minmax(var(--nav-rail),1fr)_minmax(0,var(--nav-article))_minmax(0,1fr)]"
    ).children(
      Nav(h, { props: { sections } }),
      h.main.class(
        "article-main px-[clamp(20px,5vw,48px)] pt-10 pb-24",
        "[--column:68ch] [--wide:1180px] rail:px-(--nav-gutter)"
      ).children(
        h.div.class("article-masthead").children(
          h.a.class("article-brand").attr(
            "href",
            "https://effect.website/"
          )
            .children(
              h.img.attr("src", "/effect-mark.svg").attr("alt", "")
                .attr("width", "24").attr("height", "24"),
              "Effect UI"
            ),
          h.div.class("article-links").children(
            h.a.attr("href", "https://effect.website/docs/v4")
              .children("Effect docs"),
            h.a.attr("href", "https://github.com/Effect-TS/ui")
              .children("GitHub ↗")
          )
        ),
        h.header.class("article-header").children(
          h.p.class("article-eyebrow").children(
            "// FROM FOLDKIT TO EFFECT UI"
          ),
          h.h1.class(
            "text-[clamp(2.2rem,5.2vw,3.6rem)]/[1.08] font-bold",
            "tracking-[-0.035em] text-balance"
          ).children(title)
        ),
        Markdown.viewBlocks(h, article, {
          views: {
            Heading: (h, node, content) => {
              const { id, isNested } = fromHeading(node)
              return isNested
                ? h.h3.id(id).class(
                  heading,
                  "mt-12 text-lg/[1.35] tracking-[-0.01em]"
                ).children(content)
                : h.h2.id(id).class(
                  heading,
                  "article-section mt-18 text-[1.5rem]/[1.3] tracking-[-0.02em]"
                ).children(content)
            },
            Paragraph: (h, _paragraph, content) =>
              h.p.class(
                "[main>&]:mx-auto [main>&]:max-w-(--column)",
                "mt-[1.1em] text-pretty first:mt-0",
                "[header+&]:mt-7 [header+&]:text-[1.1875rem]/[1.55]"
              ).children(content),
            List: (h, list, items) =>
              list.isOrdered
                ? Markdown.defaultViews.List(h, list, items)
                : h.ul.class(
                  block,
                  "mt-[1.1em] grid list-disc gap-[0.5em] pl-[1.25em]",
                  "text-pretty"
                ).children(items),
            CodeBlock: (h, { value }) =>
              h.pre.class(
                block,
                "mt-[1.1em] rounded-lg border border-border px-3.5 py-3",
                "text-code wrap-anywhere whitespace-pre-wrap",
                "[font-variant-ligatures:none]"
              ).children(h.code.children(value)),
            InlineCode: (h, { value }) =>
              h.code.class(
                "rounded-sm bg-muted px-[0.35em] py-[0.1em] text-[0.86em]",
                "wrap-anywhere [font-variant-ligatures:none]"
              ).children(value),
            Link: (h, { title, url }, content) =>
              h.a.class(
                "underline decoration-border-strong underline-offset-3",
                "hover:decoration-current"
              ).attr("href", url).attr(
                "title",
                Option.getOrUndefined(title)
              ).children(content),
            Strong: (h, _strong, content) =>
              h.strong.class("font-semibold").children(content)
          },
          islands: Markdown.islandsFor(Islands, {
            AgentPrompt: (h, { prompt, title }) =>
              AgentPrompt(h, {
                props: {
                  title,
                  prompt: prompt.replace("$URL", articleUrl)
                }
              }),
            Diagram: (h, { scenario }) =>
              Diagram(h, { key: scenario, props: { scenario } }),
            Compare: (h, attributes, caption) =>
              h.figure.class(wide, "code-comparison").children(
                // One row for the titles and one per file, shared by
                // both sides, so the n-th file starts level on each.
                h.div.class("comparison-columns").style({
                  "--comparison-rows": String(
                    1 + Math.max(
                      snippets[attributes.foldkit].length,
                      snippets[attributes.effect].length
                    )
                  )
                }).children(
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
              h.figure.class(listing).children(
                ...snippets[code].map((snippet, index) =>
                  h.div.key(snippet.name).children(
                    Code(
                      h,
                      snippet,
                      // The Counter's grid tracks are sized by the
                      // panel, never by a label, so a changing label
                      // or count can't move them.
                      index === 0
                        ? [
                          h.div.class(
                            "live-demo @container border-b border-border",
                            "bg-background px-3.5 py-4",
                            "[&>div]:grid [&>div]:grid-cols-1",
                            "[&>div]:items-center",
                            "@min-[312px]:[&>div]:grid-cols-[repeat(2,minmax(0,1fr))]",
                            "@min-[560px]:[&>div]:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,3fr))]",
                            "[&_output]:text-start",
                            "[&_output]:text-[2rem]/[normal]",
                            "[&_output]:font-features-[normal]",
                            "[&_button]:font-features-[normal]",
                            "[&_button]:whitespace-nowrap"
                          ).attr("role", "group")
                            .attr("aria-label", label).children(
                              Counter(h, {
                                key: `counter-${occurrence}`
                              })
                            )
                        ]
                        : []
                    )
                  )
                ),
                Caption(h, caption)
              ),
            Listing: (h, { code }, caption) =>
              h.figure.class(listing).children(
                ...Files(h, snippets[code]),
                Caption(h, caption)
              ),
            PlayTest: (h) =>
              PlayTest(h, { props: { snippet: snippets.play[0] } }),
            PerformanceChart: (h) => PerformanceChart(h),
            AllResults: (h) => AllResults(h, {}),
            Footer: (h, _attributes, content) =>
              h.footer.class(
                "mx-auto mt-24 max-w-[68ch] border-t border-border pt-6",
                "text-sm text-muted-foreground"
              ).children(content)
          })
        })
      )
    )
  }
})
