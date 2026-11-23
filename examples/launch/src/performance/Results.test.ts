import { assert, describe, it } from "@effect/vitest"
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { format, frameworks, load, names, script, summary, value } from "./Results.ts"

const results = fileURLToPath(
  new URL("../../../../packages/ui/benchmark/js-framework-benchmark/results", import.meta.url)
)

interface Result {
  readonly framework: string
  readonly benchmark: string
  readonly values: Record<string, { readonly values: ReadonlyArray<number> }>
}

const files: ReadonlyArray<Result> = ["pass1", "pass2"].flatMap((pass) =>
  fs.readdirSync(path.join(results, pass)).filter((file) => file.endsWith(".json")).map((file) =>
    JSON.parse(fs.readFileSync(path.join(results, pass, file), "utf8"))
  )
)

const median = (xs: ReadonlyArray<number>): number => {
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

const pooled = (framework: string, benchmark: string, key: string): number =>
  median(
    files.filter((result) =>
      result.benchmark === benchmark &&
      (result.framework === framework + "-keyed" || result.framework.startsWith(framework + "-v"))
    ).flatMap((result) => result.values[key]?.values ?? [])
  )

describe("benchmark results", () => {
  it("match the medians of both runs' raw values", () => {
    for (const [rows, key] of [[script, "script"], [load, "DEFAULT"]] as const) {
      for (const row of rows) {
        frameworks.forEach((framework, index) => {
          assert.strictEqual(
            format(row.values[index]!),
            format(pooled(framework, row.benchmark, key)),
            `${framework} ${row.benchmark}`
          )
        })
      }
    }
  })

  it("summarises script time as a multiple of vanilla JS, fastest first", () => {
    assert.deepStrictEqual(
      summary.map((entry) => [names[entry.framework], entry.multiple.toFixed(2)]),
      [
        ["Vanilla JS", "1.00"],
        ["Solid", "1.92"],
        ["Svelte", "2.46"],
        ["Vue", "3.74"],
        ["Effect UI", "4.79"],
        ["Foldkit 0.x", "6.55"],
        ["React", "6.57"]
      ]
    )
  })

  it("has Effect UI below Foldkit 0.x in the summary and in every load row", () => {
    const multiple = (framework: string) => summary.find((entry) => entry.framework === framework)!.multiple
    assert.isBelow(multiple("effect-ui"), multiple("foldkit"))
    for (const row of load) {
      assert.isBelow(value(row, "effect-ui"), value(row, "foldkit"), row.benchmark)
    }
  })
})
