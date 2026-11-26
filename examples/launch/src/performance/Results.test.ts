import { assert, describe, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import {
  format,
  type Framework,
  load,
  summary,
  value
} from "./Results.ts"

describe("benchmark results", () => {
  it("are the figures the article quotes", () => {
    const article = readFileSync(
      new URL("../article.md", import.meta.url),
      "utf8"
    )
    const paragraph = article.split("\n").find((line) =>
      line.startsWith("In [js-framework-benchmark]")
    )!
    const multiple = (framework: Framework) =>
      summary.find((entry) => entry.framework === framework)!.multiple
        .toFixed(2)
    const pair = (benchmark: string) => {
      const row = load.find((row) => row.benchmark === benchmark)!
      return [value(row, "effect-ui"), value(row, "foldkit")].map(
        format
      )
    }
    assert.deepStrictEqual(
      Array.from(
        paragraph.matchAll(/(\d+(?:\.\d+)?)(?:×| ms| MB)/g),
        (match) => match[1]
      ),
      [
        multiple("effect-ui"),
        multiple("foldkit"),
        ...pair("43_first-paint"),
        ...pair("22_run-memory")
      ]
    )
  })
})
