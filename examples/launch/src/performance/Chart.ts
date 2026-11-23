import type { View } from "@effect/ui"
import { format, type Framework, frameworks, links, load, names, type Row, script, summary, value } from "./Results.ts"

const spoken = { ms: "milliseconds", kB: "kilobytes", MB: "megabytes" } as const

const Amount = <M>(h: View.H<M>, row: Row, framework: Framework) => [
  format(value(row, framework)),
  h.span.class("unit").attr("aria-hidden", "true").children(" ", row.unit),
  h.span.class("sr-only").children(" ", spoken[row.unit])
]

const Label = <M>(h: View.H<M>, row: Row) =>
  h.th.attr("scope", "row").children(
    row.label,
    row.slowdown !== undefined && h.span.class("perf-note").children(`${row.slowdown}× CPU throttle`)
  )

const slowest = Math.max(...summary.map((entry) => entry.multiple))

export const PerformanceChart = <M>(h: View.H<M>) =>
  h.figure.class("perf2").children(
    h.ol.class("perf2-rows").attr("role", "list").children(
      ...summary.map((entry) =>
        h.li.key(entry.framework).class(entry.framework === "effect-ui" ? "perf2-row perf2-effect" : "perf2-row")
          .children(
            h.span.class("perf2-name").children(names[entry.framework]),
            " ",
            h.span.class("perf2-bar").attr("aria-hidden", "true").style({
              width: `${(entry.multiple / slowest) * 100}%`
            }),
            h.span.class("perf2-value").children(`${entry.multiple.toFixed(2)}×`)
          )
      )
    ),
    h.figcaption.class("caption").children(
      "Script time across the nine operations, as a multiple of vanilla JS (geometric mean). Shorter is faster. Read the ",
      h.a.attr("href", links.methodology).children("methodology"),
      " or the ",
      h.a.attr("href", links.data).children("raw results"),
      "."
    )
  )

const scriptTitle = "Median script time per operation"
const loadTitle = "Page load and memory"

const Full = <M>(h: View.H<M>, title: string, rows: ReadonlyArray<Row>) =>
  h.div.class("table-scroll").attrs({ role: "region", "aria-label": title, tabindex: "0" }).children(
    h.table.class("perf-table").children(
      h.caption.children(title),
      h.thead.children(
        h.tr.children(
          h.th.attr("scope", "col").children("Workload"),
          ...frameworks.map((framework) => h.th.attr("scope", "col").children(names[framework]))
        )
      ),
      h.tbody.children(
        ...rows.map((row) =>
          h.tr.key(row.benchmark).children(
            Label(h, row),
            ...frameworks.map((framework) =>
              h.td.class(framework === "effect-ui" ? "effect-ui" : "").children(...Amount(h, row, framework))
            )
          )
        )
      )
    )
  )

export const AllResults = <M>(h: View.H<M>) =>
  h.details.class("perf-all").children(
    h.summary.children("Results for all seven frameworks, where lower is better"),
    Full(h, scriptTitle, script),
    Full(h, loadTitle, load)
  )
