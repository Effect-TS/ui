import { Component, UiSchema, type View } from "@effect/ui"
import { Collapsible } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import {
  format,
  type Framework,
  frameworks,
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

const Amount = <M>(h: View.H<M>, row: Row, framework: Framework) => [
  format(value(row, framework)),
  h.span.class("unit").attr("aria-hidden", "true").children(
    " ",
    row.unit
  ),
  h.span.class("sr-only").children(" ", spoken[row.unit])
]

const Label = <M>(h: View.H<M>, row: Row) =>
  h.th.attr("scope", "row").children(
    row.label,
    row.slowdown !== undefined &&
      h.span.class("perf-note").children(
        `${row.slowdown}× CPU throttle`
      )
  )

const slowest = Math.max(...summary.map((entry) => entry.multiple))

export const PerformanceChart = <M>(h: View.H<M>) =>
  h.figure.class("perf2").children(
    h.ol.class("perf2-rows").attr("role", "list").children(
      ...summary.map((entry) =>
        h.li.key(entry.framework).class(
          entry.framework === "effect-ui"
            ? "perf2-row perf2-effect"
            : "perf2-row"
        )
          .children(
            h.span.class("perf2-name").children(
              names[entry.framework]
            ),
            " ",
            h.span.class("perf2-bar").attr("aria-hidden", "true")
              .style({
                width: `${(entry.multiple / slowest) * 100}%`
              }),
            h.span.class("perf2-value").children(
              `${entry.multiple.toFixed(2)}×`
            )
          )
      )
    ),
    h.figcaption.class("caption").children(
      "Time spent running JavaScript across the nine operations, as a multiple of vanilla JS (geometric mean). Shorter is faster. Read the ",
      h.a.attr("href", links.methodology).children("methodology"),
      " or the ",
      h.a.attr("href", links.data).children("raw results"),
      "."
    )
  )

const scriptTitle = "Median time running JavaScript per operation"
const loadTitle = "Page load and memory"

const Full = <M>(
  h: View.H<M>,
  title: string,
  rows: ReadonlyArray<Row>
) =>
  h.div.class("table-scroll").attrs({
    role: "region",
    "aria-label": title,
    tabindex: "0"
  }).children(
    h.table.class("perf-table").children(
      h.caption.children(title),
      h.thead.children(
        h.tr.children(
          h.th.attr("scope", "col").children("Workload"),
          ...frameworks.map((framework) =>
            h.th.attr("scope", "col").children(names[framework])
          )
        )
      ),
      h.tbody.children(
        ...rows.map((row) =>
          h.tr.key(row.benchmark).children(
            Label(h, row),
            ...frameworks.map((framework) =>
              h.td.class(framework === "effect-ui" ? "effect-ui" : "")
                .children(...Amount(h, row, framework))
            )
          )
        )
      )
    )
  )

const AllResultsMessage = UiSchema.TaggedEnum({
  ToggledResults: { open: Schema.Boolean }
})

export const AllResults = Component.define({
  name: "AllResults",
  scoped: false,
  model: Schema.Struct({ isOpen: Schema.Boolean }),
  message: AllResultsMessage,
  elements: Html
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
        collapsible.root(h.div.class("perf-all")).children(
          collapsible.trigger(h.button.class("perf-all-trigger"))
            .children(
              "Results for all seven frameworks, where lower is better",
              h.span.class("perf-all-chevron").attr(
                "aria-hidden",
                "true"
              )
            ),
          collapsible.panel(h.div.class("perf-all-panel"))?.children(
            Full(h, scriptTitle, script),
            Full(h, loadTitle, load)
          )
        )
    })
})
