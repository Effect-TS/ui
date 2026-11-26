/// <reference types="@effect/ui/html/MarkdownContent" />
import { caption } from "#components/Classes"
import { Code } from "#components/Code"
import { Comparison } from "#components/Comparison"
import { Icon } from "#components/Icon"
import { LauncherPointer } from "#components/LauncherPointer"
import { type Feature, fromItem, type Layout } from "#domain/Feature"
import { Islands } from "#domain/Island"
import * as Preview from "#domain/Preview"
import * as Prompt from "#domain/Prompt"
import { fromDocument, fromHeading } from "#domain/Section"
import { type Snippet, Snippets, textOf } from "#domain/Snippet"
import { Head, Subscription, type View } from "@effect/ui"
import { Html, Markdown } from "@effect/ui/html"
import { Effect, Option, Schema, Stream } from "effect"
import source, { frontmatter } from "./article.md"
import { Counter } from "./autocounter/Counter.ts"
import { Page } from "./counter/effect/Page.ts"
import { Architecture } from "./diagram/Architecture.ts"
import { Diagram } from "./diagram/Diagram.ts"
import { Kit } from "./kit/Kit.ts"
import { Nav } from "./nav/Nav.ts"
import { AllResults, PerformanceChart } from "./performance/Chart.ts"
import { PlayTest } from "./playtest/PlayTest.ts"
import { AgentPrompts } from "./prompt/AgentPrompts.ts"

const article = Markdown.decodeDocument(source)

const sections = fromDocument(article)

const prompts = Prompt.fromDocument(article)

const title = frontmatter?.title ?? ""

const block = "mx-auto max-w-(--column)"

const listing = [
  block,
  "my-10 flex flex-col gap-3 [p+&]:mt-[1.1em]"
].join(" ")

const heading =
  "min-w-0 scroll-mt-[calc(var(--nav-bar)+24px)] text-balance"

// A link to a heading's own section, as on effect.website. It sits
// before the heading, and from 64rem in the margin beside it.
const Permalink = <M>(h: Html.H<M>, id: string, label: string) =>
  h.a.class(
    "mr-[0.35em] inline-flex size-[0.75em] flex-none translate-y-[0.06em]",
    "rounded-sm text-subtle-foreground hover:text-foreground",
    "focus-visible:text-foreground focus-visible:outline-accent",
    "motion-safe:transition-colors motion-safe:duration-150",
    "min-[64rem]:absolute min-[64rem]:top-[0.3em]",
    "min-[64rem]:right-full min-[64rem]:translate-y-0"
  ).attrs({ href: `#${id}`, "aria-label": `Link to ${label}` })
    .children(
      Icon(h, "link", { class: "size-full" })
    )

// A side of a comparison, from a title such as "Effect UI: Page
// renders Counter": the name before the colon goes on the side's tab.
const side = (title: string, files: ReadonlyArray<Snippet>) => {
  const [label = title, ...about] = title.split(": ")
  return { label, about: about.join(": "), files }
}

// A long file starts collapsed to a preview.
const previewOf = (snippet: Snippet) => Preview.of(textOf(snippet))

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

// The app a comparison's code builds, running above the code.
const Example = <M>(h: Html.H<M>, app: View.Content<M>) =>
  h.div.class("border-b border-border").attrs({
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
      "hover:decoration-accent-text"
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
        "grid size-9 place-items-center rounded-lg text-accent-text",
        "bg-[color-mix(in_oklab,var(--color-accent)_10%,var(--color-background))]"
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
    Icon(h, feature.icon, {
      class: "mt-[0.1875rem] size-5 text-accent-text"
    }),
    h.p.class("font-medium text-pretty").children(feature.title)
  )

const hashTarget = () => {
  const { hash } = window.location
  if (hash.length <= 1) return null
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)))
  } catch {
    return null
  }
}

// The page is rendered on the client after initial HTML load, so the
// browser's own fragment scroll runs before the headings exist. Jump
// straight to the target once mounted, and re-align after webfonts
// settle if the user hasn't scrolled away.
const ScrollToInitialHash = Subscription.make(
  "initial-hash",
  Stream.fromEffect(
    Effect.gen(function*() {
      if (
        typeof window === "undefined" ||
        typeof document === "undefined"
      ) return
      const target = hashTarget()
      if (target === null) return
      const align = () => {
        target.scrollIntoView({ behavior: "instant" })
        return window.scrollY
      }
      const landed = align()
      if ("fonts" in document) {
        yield* Effect.promise(() => document.fonts.ready)
        if (Math.abs(window.scrollY - landed) < 2) {
          align()
        }
      }
    })
  ).pipe(Stream.drain)
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
  subscriptions: () => [ScrollToInitialHash],
  head: () => [Head.title(title)],
  view: (h) => {
    const { articleUrl, snippets } = h.props
    return h.div.class(
      "[--nav-bar:3rem]",
      "[--nav-inset:max(clamp(20px,5vw,48px),calc((100%-68ch)/2))]",
      "rail:grid rail:[--nav-bar:0px] rail:[--nav-rail:12rem]",
      "rail:[--nav-gutter:48px]",
      "rail:[--nav-article:calc(1180px+2*var(--nav-gutter))]",
      // The rail and the article are centered together, so the
      // margins beside them are equal.
      "rail:grid-cols-[var(--nav-rail)_minmax(0,var(--nav-article))]",
      "rail:justify-center"
    ).children(
      h.a.class("skip-link").attr("href", "#content").children(
        "Skip to content"
      ),
      Nav(h, { props: { sections } }),
      // Focusable from script only, so the skip link moves focus here.
      h.main.id("content").attr("tabindex", "-1").class(
        "focus:outline-none",
        "article-main px-[clamp(20px,5vw,48px)] pt-10 pb-24",
        "[--column:68ch] [--wide:1180px] rail:px-(--nav-gutter)"
      ).children(
        h.div.class("article-masthead").children(
          h.a.class("article-brand").attr(
            "href",
            "https://effect.website/"
          )
            .children(
              // The logo comes in black and in white, so the browser
              // picks the file that suits the color scheme.
              h.picture.children(
                h.source.attr("srcset", "/effect-ui-white.svg").attr(
                  "media",
                  "(prefers-color-scheme: dark)"
                ),
                h.img.attr("src", "/effect-ui-black.svg").attr(
                  "alt",
                  "Effect UI"
                ).attr("width", "123").attr("height", "28")
              )
            ),
          h.div.class("article-links").children(
            h.a.attr("href", "https://effect.website/docs/v4")
              .children("Effect docs"),
            h.a.attr("href", "https://github.com/Effect-TS/ui")
              .class("inline-flex items-center gap-0.5").children(
                "GitHub",
                Icon(h, "external", { class: "size-3.5" })
              )
          )
        ),
        h.header.class("article-header").children(
          h.div.class("mx-auto max-w-(--column)").children(
            h.p.class("article-eyebrow").children(
              "// PUBLIC PREVIEW"
            ),
            h.h1.class(
              "text-[clamp(2.2rem,5.2vw,3.6rem)]/[1.08] font-bold",
              "tracking-[-0.035em] text-balance"
            ).children(title)
          )
        ),
        Markdown.viewBlocks(h, article, {
          views: {
            Heading: (h, node, content) => {
              const { id, isNested, label } = fromHeading(node)
              // The link is beside the heading, not inside it, so the
              // heading's name stays its own text.
              return h.div.class(
                block,
                "group relative flex items-baseline font-[620]",
                isNested
                  ? "mt-12 text-lg/[1.35] tracking-[-0.01em]"
                  : "mt-18 text-[1.5rem]/[1.3] tracking-[-0.02em]"
              ).children(
                Permalink(h, id, label),
                isNested
                  ? h.h3.id(id).class(heading).children(content)
                  : h.h2.id(id).class(heading).children(content)
              )
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
            AgentPrompts: (h) =>
              AgentPrompts(h, {
                props: {
                  prompts: prompts.map((prompt) => ({
                    ...prompt,
                    prompt: prompt.prompt.replace("$URL", articleUrl)
                  }))
                }
              }),
            // AgentPrompts reads these from the document and draws
            // them itself, so what this returns is never shown.
            AgentPrompt: (h) => h.span,
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
            Architecture: (h) => Architecture(h),
            Diagram: (h, { scenario }) =>
              Diagram(h, { key: scenario, props: { scenario } }),
            Compare: (h, attributes, caption) =>
              h.figure.class(listing).children(
                Comparison(h, {
                  key: attributes.foldkit,
                  slots: {
                    example: attributes.example === "counter" &&
                      Example(h, Page(h, { key: "example" }))
                  },
                  props: {
                    sides: [
                      side(
                        attributes.foldkitTitle,
                        snippets[attributes.foldkit]
                      ),
                      side(
                        attributes.effectTitle,
                        snippets[attributes.effect]
                      )
                    ]
                  }
                }),
                Caption(h, caption)
              ),
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
              PlayTest(h, {
                props: {
                  tests: [
                    { id: "counter", snippet: snippets.play[0] },
                    { id: "signIn", snippet: snippets.playSignIn[0] },
                    { id: "snake", snippet: snippets.playSnake[0] }
                  ]
                }
              }),
            Kit: (h) => Kit(h, {}),
            LauncherPointer: (h, _attributes, content) =>
              LauncherPointer(h, content),
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
