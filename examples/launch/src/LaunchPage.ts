/// <reference types="@effect/ui/html/MarkdownContent" />
import { caption, wide } from "#components/Classes"
import { Code } from "#components/Code"
import { CodeGroup } from "#components/CodeGroup"
import { Icon } from "#components/Icon"
import { type Feature, fromItem, type Layout } from "#domain/Feature"
import { Islands } from "#domain/Island"
import * as Preview from "#domain/Preview"
import { fromDocument, fromHeading } from "#domain/Section"
import { type Snippet, Snippets } from "#domain/Snippet"
import { Head, type View } from "@effect/ui"
import { Html, Markdown } from "@effect/ui/html"
import { Option, Schema } from "effect"
import source, { frontmatter } from "./article.md"
import { Counter } from "./autocounter/Counter.ts"
import { Diagram } from "./diagram/Diagram.ts"
import { Nav } from "./nav/Nav.ts"
import { SiteHeader } from "./nav/SiteHeader.ts"
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

const textOf = (snippet: Snippet) =>
  snippet.lines.map((line) =>
    line.map((token) => token.text).join("")
  )

// A long file starts collapsed to a preview.
const previewOf = (snippet: Snippet) => Preview.of(textOf(snippet))

// In a comparison, a row of files collapses when either side's file
// is long, so the two stay level. The shorter one then collapses
// whenever that hides anything.
const rowPreviews = (
  sides: ReadonlyArray<ReadonlyArray<Snippet>>
): ReadonlyArray<ReadonlyArray<Preview.Preview | undefined>> =>
  sides.map((files) =>
    files.map((snippet, row) =>
      sides.some((side) =>
          side[row] !== undefined &&
          previewOf(side[row]) !== undefined
        )
        ? Preview.of(textOf(snippet), 1)
        : undefined
    )
  )

const Files = <M>(
  h: Html.H<M>,
  files: ReadonlyArray<Snippet>,
  previews: ReadonlyArray<Preview.Preview | undefined> = files.map(
    previewOf
  )
) =>
  files.map((snippet, row) =>
    h.div.key(snippet.name).children(
      Code(h, snippet, { preview: previews[row], row })
    )
  )

const Example = <M>(
  h: Html.H<M>,
  title: string,
  files: ReadonlyArray<Snippet>,
  previews: ReadonlyArray<Preview.Preview | undefined>
) =>
  h.section.class("comparison-side").attr("aria-label", title)
    .children(
      h.p.class("text-[0.9375rem]/[1.4] font-semibold text-pretty")
        .children(title),
      Files(h, files, previews)
    )

const Caption = <M>(
  h: Html.H<M>,
  content: ReadonlyArray<View.Content<M>>
) =>
  content.length > 0 &&
  h.figcaption.class(caption).children(content)

const inline: Pick<
  Markdown.Views<never>,
  "InlineCode" | "Link" | "Strong"
> = {
  InlineCode: (h, { value }) =>
    h.code.class(
      "rounded-sm bg-muted px-[0.35em] py-[0.1em] text-[0.86em]",
      "wrap-anywhere [font-variant-ligatures:none]"
    ).children(value),
  Link: (h, { title, url }, content) =>
    h.a.class(
      "underline decoration-border-strong underline-offset-3",
      "hover:decoration-current"
    ).attr("href", url).attr("title", Option.getOrUndefined(title))
      .children(content),
  Strong: (h, _strong, content) =>
    h.strong.class("font-semibold").children(content)
}

const layouts = {
  rows: "mt-[1.6em] grid gap-7",
  grid: "mt-[1.4em] grid gap-x-8 gap-y-6 min-[700px]:grid-cols-2",
  checklist: "mt-[1.1em] grid gap-3"
} satisfies Record<Layout, string>

// A bullet with an icon: a row with the icon in a column of its
// own, so the label and the description under it share a left edge.
const Card = (h: Html.H<never>, feature: Feature) =>
  h.li.class("grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4")
    .children(
      h.span.class(
        "grid size-9 place-items-center rounded-lg bg-muted"
      ).children(Icon(h, feature.icon, { class: "size-[1.125rem]" })),
      h.div.children(
        // Level with the middle of the icon.
        h.p.class("pt-[0.4375rem] text-base/[1.4] font-semibold")
          .children(feature.title),
        Markdown.viewBlocks(
          h,
          {
            blocks: [{
              _tag: "Paragraph",
              content: feature.description
            }]
          },
          {
            views: {
              ...inline,
              Paragraph: (h, _paragraph, content) =>
                h.p.class(
                  "mt-1 text-[0.9375rem]/[1.6] text-pretty",
                  "text-prose-foreground"
                ).children(content)
            }
          }
        )
      )
    )

// Something that carries over from Foldkit 0.x: an entry of a
// checklist, a statement that stands on its own.
const Kept = (h: Html.H<never>, feature: Feature) =>
  h.li.class(
    "grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3"
  ).children(
    // Level with the first line of the statement.
    Icon(h, feature.icon, { class: "mt-[0.1875rem] size-5" }),
    h.p.class("font-medium text-pretty").children(feature.title)
  )

export const LaunchPage = Html.component({
  name: "LaunchPage",
  props: Schema.Struct({
    snippets: Snippets,
    articleUrl: Schema.String
  }),
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  head: () => [Head.title(title)],
  view: (h) => {
    const { articleUrl, snippets } = h.props
    return h.div.class(
      "[--site-header:64px]",
      "[--toc-bar:3rem]",
      "rail:[--toc-bar:0px]",
      "[--nav-bar:calc(var(--site-header)+var(--toc-bar))]",
      "[--nav-inset:max(clamp(20px,5vw,48px),calc((100%-68ch)/2))]"
    ).children(
      h.a.class("skip-link").attr("href", "#content").children(
        "Skip to content"
      ),
      SiteHeader(h, {}),
      h.div.class(
        "rail:grid rail:[--nav-rail:12rem]",
        "rail:[--nav-gutter:48px]",
        "rail:[--nav-article:calc(1180px+2*var(--nav-gutter))]",
        "rail:grid-cols-[minmax(var(--nav-rail),1fr)_minmax(0,var(--nav-article))_minmax(0,1fr)]"
      ).children(
        Nav(h, { props: { sections } }),
        // Focusable from script only, so the skip link moves focus here.
        h.main.id("content").attr("tabindex", "-1").class(
          "scroll-mt-(--nav-bar) focus:outline-none",
          "article-main px-[clamp(20px,5vw,48px)] pt-10 pb-24",
          "max-rail:pt-8",
          "[--column:68ch] [--wide:1180px] rail:px-(--nav-gutter)"
        ).children(
          h.header.class("article-header").children(
            h.p.class("article-eyebrow").children(
              "// PUBLIC PREVIEW"
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
                    "mt-18 text-[1.5rem]/[1.3] tracking-[-0.02em]"
                  ).children(content)
              },
              Paragraph: (h, _paragraph, content) =>
                h.p.class(
                  "[main>&]:mx-auto [main>&]:max-w-(--column)",
                  "mt-[1.1em] text-pretty first:mt-0",
                  // The lede: the first paragraph, set larger and closed
                  // off from the article by a rule.
                  "[header+&]:mt-8 [header+&]:mb-8 [header+&]:border-b",
                  "[header+&]:border-border [header+&]:pb-8",
                  "[header+&]:text-[1.3125rem]/[1.5]",
                  "[header+&]:tracking-[-0.011em] [header+&]:text-balance",
                  "compact:[header+&]:text-[1.1875rem]/[1.5]"
                ).children(content),
              List: (h, list, items) =>
                list.isOrdered
                  ? Markdown.defaultViews.List(h, list, items)
                  : list.items.every((item) =>
                      fromItem(item) !== undefined
                    )
                  ? h.ul.class(
                    block,
                    layouts[
                      list.items.flatMap((item) =>
                        fromItem(item)?.layout ?? []
                      )[0] ?? "rows"
                    ]
                  ).children(items)
                  : h.ul.class(
                    block,
                    "mt-[1.1em] grid list-disc gap-[0.5em] pl-[1.25em]",
                    "text-pretty"
                  ).children(items),
              ListItem: (h, item, blocks) => {
                const feature = fromItem(item)
                return feature === undefined
                  ? Markdown.defaultViews.ListItem(h, item, blocks)
                  : feature.layout === "checklist"
                  ? Kept(h, feature)
                  : Card(h, feature)
              },
              Table: (h, _table, headerRow, bodyRows) =>
                h.div.class(block, "mt-[1.4em] overflow-x-auto")
                  .children(
                    h.table.class(
                      "w-full border-collapse text-[0.9375rem]/[1.5]",
                      "compact:text-[0.875rem]/[1.5]"
                    ).children(
                      h.thead.children(headerRow),
                      h.tbody.children(bodyRows)
                    )
                  ),
              TableCell: (h, _cell, content, _alignment, isHeader) =>
                isHeader
                  ? h.th.attr("scope", "col").class(
                    "border-b border-border-strong pe-5 pb-2 text-start",
                    "font-mono text-[0.6875rem] font-medium",
                    "tracking-[0.08em] uppercase text-muted-foreground",
                    "font-features-[normal] last:pe-0 compact:pe-3"
                  ).children(content)
                  : h.td.class(
                    "border-b border-border py-3 pe-5 align-top",
                    "text-prose-foreground last:pe-0 compact:pe-3",
                    // A name in code stays in one piece.
                    "[&_code]:whitespace-nowrap",
                    "min-[521px]:last:whitespace-nowrap",
                    "[tr:last-child>&]:border-b-0"
                  ).children(content),
              CodeBlock: (h, { value }) =>
                h.pre.class(
                  block,
                  "mt-[1.1em] rounded-lg border border-border px-3.5 py-3",
                  "text-code wrap-anywhere whitespace-pre-wrap",
                  "[font-variant-ligatures:none]"
                ).children(h.code.children(value)),
              ...inline
            },
            islands: Markdown.islandsFor(Islands, {
              AgentPrompt: (h, { prompt, title }) =>
                AgentPrompt(h, {
                  key: title,
                  props: {
                    title,
                    prompt: prompt.replace("$URL", articleUrl)
                  }
                }),
              Chips: (h, { items, label }) =>
                h.div.class(block, "mt-6").children(
                  h.p.class(
                    "font-mono text-[0.6875rem] tracking-[0.08em]",
                    "uppercase text-muted-foreground",
                    "font-features-[normal]"
                  ).children(label),
                  h.ul.class("mt-2.5 flex flex-wrap gap-2").children(
                    items.split(",").map((item) =>
                      h.li.key(item.trim()).class(
                        "rounded-full border border-border bg-muted",
                        "px-3 py-1 text-[0.8125rem]/[1.4]",
                        "text-prose-foreground first-letter:uppercase"
                      ).children(item.trim())
                    )
                  )
                ),
              PageOnly: (h, _attributes, content) =>
                h.div.class("mx-auto mt-[1.1em] max-w-(--column)")
                  .children(content),
              Diagram: (h, { scenario }) =>
                Diagram(h, { key: scenario, props: { scenario } }),
              Compare: (h, attributes, caption) => {
                const foldkit = snippets[attributes.foldkit]
                const effect = snippets[attributes.effect]
                const [foldkitPreviews = [], effectPreviews = []] =
                  rowPreviews([foldkit, effect])
                // The files inside the CodeGroup share which rows are
                // open.
                return CodeGroup(h, {
                  key: attributes.foldkit,
                  view: () =>
                    h.figure.class(wide, "code-comparison").children(
                      // One row for the titles and one per file,
                      // shared by both sides, so the n-th file starts
                      // level on each.
                      h.div.class("comparison-columns").style({
                        "--comparison-rows": String(
                          1 + Math.max(foldkit.length, effect.length)
                        )
                      }).children(
                        Example(
                          h,
                          attributes.foldkitTitle,
                          foldkit,
                          foldkitPreviews
                        ),
                        Example(
                          h,
                          attributes.effectTitle,
                          effect,
                          effectPreviews
                        )
                      ),
                      Caption(h, caption)
                    )
                })
              },
              Counter: (h, { code, label }, caption, occurrence) =>
                h.figure.class(listing).children(
                  snippets[code].map((snippet, index) =>
                    h.div.key(snippet.name).children(
                      Code(h, snippet, {
                        preview: previewOf(snippet),
                        // The Counter's grid tracks are sized by the
                        // panel, never by a label, so a changing label
                        // or count can't move them.
                        demo: index === 0 &&
                          h.div.class(
                            "live-demo @container border-b border-border",
                            "bg-background px-3.5 py-4",
                            "[&>div]:grid [&>div]:grid-cols-2",
                            "[&>div]:items-center",
                            // The two add buttons share the width
                            // one of the others takes.
                            "[&>div>:not(.counter-add)]:col-span-2",
                            "@min-[312px]:[&>div]:grid-cols-4",
                            "@min-[560px]:[&>div]:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1.5fr))_repeat(2,minmax(0,3fr))]",
                            "@min-[560px]:[&>div>:not(.counter-add)]:col-span-1",
                            "[&_output]:text-center",
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
                      })
                    )
                  ),
                  Caption(h, caption)
                ),
              Listing: (h, { code, whole }, caption) =>
                h.figure.class(listing).children(
                  Files(
                    h,
                    snippets[code],
                    whole === "true" ? [] : undefined
                  ),
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
    )
  }
})
