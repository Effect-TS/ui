// Summarizes js-framework-benchmark result files as Markdown tables.
//
//   node packages/ui/benchmark/js-framework-benchmark/summarize.mjs <results dir>...
//
// Each directory is one run of the harness (webdriver-ts/results). The values of every run are
// pooled: a cell is the median of all of them. CPU times come from the trace, in milliseconds:
// `total` from the click to the end of paint, and `script` the part of it spent running JavaScript.
// Memory is the JS heap in MB; sizes are kB. `vs vanilla` is the geometric mean, over the nine CPU
// benchmarks, of each framework's median total over vanillajs's: unweighted, unlike the harness's
// own result table.
import * as fs from "node:fs"
import * as path from "node:path"

const dirs = process.argv.slice(2)
if (dirs.length === 0) {
  console.error("usage: summarize.mjs <results dir>...")
  process.exit(1)
}

const order = ["vanillajs", "effect-ui", "foldkit", "react-hooks", "vue", "svelte", "solid"]
const cpuLabels = {
  "01_run1k": "create 1,000 rows",
  "02_replace1k": "replace 1,000 rows",
  "03_update10th1k_x16": "update every 10th row",
  "04_select1k": "select row",
  "05_swap1k": "swap rows",
  "06_remove-one-1k": "remove row",
  "07_create10k": "create 10,000 rows",
  "08_create1k-after1k_x2": "append 1,000 rows",
  "09_clear1k_x8": "clear 1,000 rows"
}
const otherLabels = {
  "21_ready-memory": "ready memory (MB)",
  "22_run-memory": "run memory (MB)",
  "25_run-clear-memory": "create/clear 5 times (MB)",
  "41_size-uncompressed": "uncompressed size (kB)",
  "42_size-compressed": "compressed size (kB)",
  "43_first-paint": "first paint (ms)"
}

// key ("total" | "script" | "DEFAULT") -> benchmark -> framework -> values, pooled and per run
const pooled = new Map()
const runs = dirs.map(() => new Map())
const versions = new Map()
const add = (map, key, benchmark, framework, data) => {
  if (!map.has(key)) map.set(key, new Map())
  const byBenchmark = map.get(key)
  if (!byBenchmark.has(benchmark)) byBenchmark.set(benchmark, new Map())
  const byFramework = byBenchmark.get(benchmark)
  byFramework.set(framework, [...(byFramework.get(framework) ?? []), ...data])
}
dirs.forEach((dir, i) => {
  for (const file of fs.readdirSync(dir).filter((file) => file.endsWith(".json"))) {
    const result = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
    const framework = order.find((f) => result.framework === f + "-keyed" || result.framework.startsWith(f + "-v"))
    if (framework === undefined) continue
    versions.set(framework, result.framework)
    for (const [key, { values }] of Object.entries(result.values)) {
      add(pooled, key, result.benchmark, framework, values)
      add(runs[i], key, result.benchmark, framework, values)
    }
  }
})

const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const frameworks = order.filter((f) => versions.has(f))
const cell = (map, key, benchmark, framework) => {
  const xs = map.get(key)?.get(benchmark)?.get(framework)
  return xs === undefined ? undefined : median(xs)
}
const format = (x) => x === undefined || Number.isNaN(x) ? "" : x >= 100 ? x.toFixed(0) : x.toFixed(1)
const vsVanilla = (map, key) =>
  frameworks.map((f) => {
    const ratios = Object.keys(cpuLabels).map((b) => cell(map, key, b, f) / cell(map, key, b, "vanillajs"))
    return ratios.some((r) => Number.isNaN(r))
      ? ""
      : Math.exp(ratios.reduce((sum, r) => sum + Math.log(r), 0) / ratios.length).toFixed(2)
  })
const row = (cells) => "| " + cells.join(" | ") + " |"
const header = (title) => [row([title, ...frameworks]), row(["---", ...frameworks.map(() => "---:")])]

for (const key of ["total", "script"]) {
  console.log([
    ...header(`CPU, ${key} (ms)`),
    ...Object.entries(cpuLabels).map(([b, label]) =>
      row([label, ...frameworks.map((f) => format(cell(pooled, key, b, f)))])
    ),
    ...(key === "total" ? [row(["**vs vanilla**", ...vsVanilla(pooled, key).map((x) => x && `**${x}**`)])] : [])
  ].join("\n") + "\n")
}
console.log([
  ...header("Memory and size"),
  ...Object.entries(otherLabels).map(([b, label]) =>
    row([label, ...frameworks.map((f) => format(cell(pooled, "DEFAULT", b, f)))])
  )
].join("\n") + "\n")
if (dirs.length > 1) {
  console.log([
    ...header("vs vanilla (total), per run"),
    ...runs.map((run, i) => row([dirs[i], ...vsVanilla(run, "total")]))
  ].join("\n") + "\n")
}
console.log("Versions: " + frameworks.map((f) => versions.get(f)).join(", "))
