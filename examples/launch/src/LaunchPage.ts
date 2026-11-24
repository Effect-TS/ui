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
import { AgentPrompt } from "./prompt/AgentPrompt.ts"

const article = Markdown.decodeDocument(source)

const sections = fromDocument(article)

const title = frontmatter?.title ?? ""

const block = "mx-auto max-w-(--column)"

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
  h.section.class("row-span-2 grid min-w-0 grid-rows-subgrid gap-y-3")
    .attr("aria-label", title).children(
      h.p.class("text-[0.9375rem]/[1.4] font-semibold text-pretty")
        .children(title),
      h.div.class("flex min-w-0 flex-col gap-3").children(
        ...Files(h, files)
      )
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
        "px-[clamp(20px,5vw,48px)] pt-[clamp(56px,12vh,128px)] pb-24",
        "[--column:68ch] [--wide:1180px] rail:px-(--nav-gutter)"
      ).children(
        h.h1.class(
          block,
          "text-[clamp(2.2rem,5.2vw,3.6rem)]/[1.05] font-[650]",
          "tracking-[-0.035em] text-balance"
        ).children(title),
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
                  "mt-18 text-[1.375rem]/[1.3] tracking-[-0.015em]"
                ).children(content)
            },
            Paragraph: (h, _paragraph, content) =>
              h.p.class(
                "[main>&]:mx-auto [main>&]:max-w-(--column)",
                "mt-[1.1em] text-pretty first:mt-0",
                "[h1+&]:mt-7 [h1+&]:text-[1.1875rem]/[1.55]"
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
              h.figure.class(wide).children(
                h.div.class(
                  "grid gap-6",
                  "grid-cols-[repeat(auto-fit,minmax(min(100%,calc(70*7.5px+30px)),1fr))]"
                ).children(
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
              h.figure.class(wide).children(
                h.div.class(
                  "grid items-start gap-6",
                  "grid-cols-[minmax(0,1fr)_minmax(220px,280px)]",
                  "stacked:grid-cols-1"
                ).children(
                  h.div.class("flex min-w-0 flex-col gap-3").children(
                    ...Files(h, snippets[code])
                  ),
                  h.div.class(
                    "sticky top-[calc(var(--nav-bar)+24px)] rounded-lg",
                    "border border-border bg-muted p-5",
                    "stacked:static stacked:-order-1 compact:p-3.5",
                    "[&>div]:grid [&>div]:grid-cols-1",
                    "[&_output]:text-start [&_output]:text-[2rem]/[normal]",
                    "[&_output]:font-features-[normal]",
                    "[&_button]:font-features-[normal]"
                  ).attr("role", "group")
                    .attr("aria-label", label).children(
                      Counter(h, { key: `counter-${occurrence}` })
                    )
                ),
                Caption(h, caption)
              ),
            Listing: (h, { code }, caption) =>
              h.figure.class(
                wide,
                "flex flex-col gap-3 [--wide:880px]"
              ).children(
                ...Files(h, snippets[code]),
                Caption(h, caption)
              ),
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
