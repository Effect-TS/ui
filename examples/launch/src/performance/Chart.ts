import type { View } from "@effect/ui"
import { format, type Framework, frameworks, links, load, names, type Row, script, value } from "./Results.ts"

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

const pair = ["effect-ui", "foldkit"] as const

const Bars = <M>(h: View.H<M>, row: Row) => {
  const largest = Math.max(...pair.map((framework) => value(row, framework)))
  const lowest = Math.min(...pair.map((framework) => value(row, framework)))
  return h.tr.key(row.benchmark).children(
    Label(h, row),
    ...pair.map((framework) =>
      h.td.class(framework).children(
        h.span.class("perf-bar").attr("aria-hidden", "true").style({
          width: `${(value(row, framework) / largest) * 100}%`
        }),
        h.span.class(value(row, framework) === lowest ? "perf-value lower" : "perf-value").children(
          ...Amount(h, row, framework)
        )
      )
    )
  )
}

const Group = <M>(
  h: View.H<M>,
  title: string,
  rows: ReadonlyArray<Row>,
  span: number,
  row: (row: Row) => View.Content<M>
) =>
  h.tbody.children(
    h.tr.class("perf-group").children(h.th.attr("scope", "rowgroup").attr("colspan", String(span)).children(title)),
    ...rows.map(row)
  )

const scriptTitle = "Median script time per operation"
const loadTitle = "Page load and memory"

export const PerformanceChart = <M>(h: View.H<M>) =>
  h.figure.class("perf").children(
    h.table.class("perf-chart").children(
      h.caption.children("Effect UI and Foldkit 0.x entries on js-framework-benchmark. Lower is better."),
      h.thead.children(
        h.tr.children(
          h.th.attr("scope", "col").children("Workload"),
          ...pair.map((framework) => h.th.attr("scope", "col").class(framework).children(names[framework]))
        )
      ),
      Group(h, scriptTitle, script, 3, (row) => Bars(h, row)),
      Group(h, loadTitle, load, 3, (row) => Bars(h, row))
    ),
    h.figcaption.class("caption").children(
      "Each value is the median of the samples from two full runs on headless Chromium, pooled: 30 samples per operation (50 for selecting a row), and one per run for size, first paint and memory. Bars compare the two entries within each row only. Rows marked with a CPU throttle ran with the harness slowing the CPU by that factor, and their values are as measured under it. Read the ",
      h.a.attr("href", links.methodology).children("methodology"),
      " or the ",
      h.a.attr("href", links.data).children("raw results"),
      "."
    )
  )

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
