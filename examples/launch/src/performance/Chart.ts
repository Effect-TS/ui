import { caption, srOnly } from "#components/Classes"
import { UiSchema } from "@effect/ui"
import { Collapsible } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import {
  columns,
  format,
  type Framework,
  links,
  load,
  names,
  type Row,
  script,
  summary,
  value
} from "./Results.ts"

const spoken = {
  ms: "milliseconds",
  kB: "kilobytes",
  MB: "megabytes"
} as const

const Amount = <M>(h: Html.H<M>, row: Row, framework: Framework) => [
  format(value(row, framework)),
  h.span.class("font-normal text-muted-foreground").attr(
    "aria-hidden",
    "true"
  ).children(
    " ",
    row.unit
  ),
  h.span.class(srOnly, "whitespace-nowrap").children(
    " ",
    spoken[row.unit]
  )
]

const cell = "py-1.5 align-middle font-normal"
const label = `${cell} text-start`
const amount = `${cell} ps-3 text-end whitespace-nowrap`
const header = "border-b border-border-strong text-muted-foreground"

// The Effect UI column: tinted from the header to the last row, with
// room between the figures and the edge of the tint.
const ours = [
  "pe-3 font-semibold",
  "bg-[color-mix(in_oklab,var(--color-accent)_10%,transparent)]"
].join(" ")

// The column before it keeps its figures off the tint.
const beforeOurs = columns[columns.indexOf("effect-ui") - 1]

const Label = <M>(h: Html.H<M>, row: Row) =>
  h.th.class(label).attr("scope", "row").children(
    row.label,
    row.slowdown !== undefined &&
      h.span.class("block text-xs text-muted-foreground").children(
        `${row.slowdown}× CPU throttle`
      )
  )

const slowest = Math.max(...summary.map((entry) => entry.multiple))

export const PerformanceChart = <M>(h: Html.H<M>) =>
  h.figure.class("mx-auto max-w-(--column) [p+&]:mt-[1.1em]")
    .children(
      h.ol.class(
        "chart-bars",
        "grid grid-cols-[max-content_minmax(0,1fr)_max-content]",
        "gap-x-3.5 gap-y-2.5 text-sm tabular-nums"
      ).attr("role", "list").children(
        summary.map((entry) => {
          const isEffect = entry.framework === "effect-ui"
          return h.li.key(entry.framework).class(
            "col-span-full grid grid-cols-subgrid items-center",
            isEffect && "font-semibold"
          )
            .children(
              h.span.children(
                names[entry.framework]
              ),
              " ",
              h.span.class(
                "chart-bar h-2.5 rounded-[3px]",
                isEffect ? "bg-accent" : "bg-border-strong"
              ).attr("aria-hidden", "true")
                .style({
                  width: `${(entry.multiple / slowest) * 100}%`
                }),
              h.span.class(
                "text-end",
                isEffect ? "text-foreground" : "text-muted-foreground"
              ).children(
                `${entry.multiple.toFixed(2)}×`
              )
            )
        })
      ),
      h.figcaption.class(caption).children(
        "Time spent running JavaScript across the nine operations, as a multiple of vanilla JS (geometric mean). Shorter is faster. Read the ",
        h.a.class("underline").attr("href", links.methodology)
          .children("methodology"),
        " or the ",
        h.a.class("underline").attr("href", links.data).children(
          "raw results"
        ),
        "."
      )
    )

const scriptTitle = "Median time running JavaScript per operation"
const loadTitle = "Page load and memory"

const Full = <M>(
  h: Html.H<M>,
  title: string,
  rows: ReadonlyArray<Row>
) =>
  h.div.class(
    "relative overflow-x-auto px-5 pt-1 pb-5",
    "not-first:border-t not-first:border-border not-first:pt-5",
    "focus-visible:-outline-offset-2"
  ).attrs({
    role: "region",
    "aria-label": title,
    tabindex: "0"
  }).children(
    h.table.class(
      "w-full min-w-160 border-collapse text-[0.8125rem] tabular-nums"
    ).children(
      h.caption.class(
        "pb-3 text-start text-[0.9375rem] font-semibold"
      ).children(title),
      h.thead.children(
        h.tr.children(
          h.th.class(label, header).attr("scope", "col").children(
            "Workload"
          ),
          columns.map((framework) =>
            h.th.class(
              amount,
              header,
              framework === "effect-ui" && `${ours} text-foreground`,
              framework === beforeOurs && "pe-3"
            ).attr("scope", "col").children(names[framework])
          )
        )
      ),
      h.tbody.children(
        rows.map((row) =>
          h.tr.key(row.benchmark).class(
            "not-first:*:border-t not-first:*:border-border"
          ).children(
            Label(h, row),
            columns.map((framework) =>
              h.td.class(
                amount,
                framework === "effect-ui" && ours,
                framework === beforeOurs && "pe-3"
              )
                .children(Amount(h, row, framework))
            )
          )
        )
      )
    )
  )

const AllResultsMessage = UiSchema.TaggedEnum({
  ToggledResults: { open: Schema.Boolean }
})

export const AllResults = Html.component({
  name: "AllResults",
  model: Schema.Struct({ isOpen: Schema.Boolean }),
  message: AllResultsMessage
}).make({
  init: () => ({ isOpen: false }),
  update: {
    ToggledResults: ($, { open }) => $.evolve({ isOpen: open })
  },
  view: (h, model) =>
    Collapsible(h, {
      props: { open: model.isOpen, hiddenUntilFound: true },
      onEmit: {
        Toggled: ({ open }) =>
          AllResultsMessage.ToggledResults({ open }),
        Settled: () => undefined
      },
      view: (collapsible) =>
        collapsible.root(
          h.div.class(
            "group mx-auto mt-[1.6em] max-w-(--column) rounded-md",
            "border border-border-strong",
            "hover:border-subtle-foreground hover:bg-card"
          )
        ).children(
          collapsible.trigger(
            h.button.class(
              "flex w-full cursor-pointer items-center justify-between",
              "rounded-md px-5 py-4 text-start text-base/[1.375]",
              "font-medium text-prose-foreground hover:text-foreground"
            )
          )
            .children(
              "Results for all seven frameworks, where lower is better",
              h.span.class(
                "ml-2 flex size-6 shrink-0 items-center justify-center",
                "bg-muted text-muted-foreground",
                "group-hover:bg-border-strong",
                "motion-safe:transition-[background-color]",
                "motion-safe:duration-200",
                "before:size-4 before:bg-current before:content-['']",
                "before:[mask:var(--icon-chevron)_center/contain_no-repeat]",
                "group-data-[open]:before:transform-[rotate(180deg)]",
                "motion-safe:before:transition-[transform]",
                "motion-safe:before:duration-200"
              ).attr(
                "aria-hidden",
                "true"
              )
            ),
          collapsible.panel(
            h.div.class(
              "h-(--collapsible-panel-height) overflow-hidden",
              "data-[starting-style]:h-0 data-[ending-style]:h-0",
              "motion-safe:transition-[height] motion-safe:duration-200",
              "motion-safe:ease-out"
            )
          )?.children(
            Full(h, scriptTitle, script),
            Full(h, loadTitle, load)
          )
        )
    })
})
