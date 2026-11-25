import { assert, describe, it } from "@effect/vitest"
import { load, names, summary, value } from "./Results.ts"

describe("benchmark results", () => {
  it("summarises script time as a multiple of vanilla JS, fastest first", () => {
    assert.deepStrictEqual(
      summary.map((
        entry
      ) => [names[entry.framework], entry.multiple.toFixed(2)]),
      [
        ["Vanilla JS", "1.00"],
        ["Solid", "1.77"],
        ["Svelte", "2.19"],
        ["Vue", "3.72"],
        ["Effect UI", "4.06"],
        ["React", "5.97"],
        ["Foldkit 0.x", "6.27"]
      ]
    )
  })

  it("has Effect UI below Foldkit 0.x in the summary and in every load row", () => {
    const multiple = (framework: string) =>
      summary.find((entry) => entry.framework === framework)!.multiple
    assert.isBelow(multiple("effect-ui"), multiple("foldkit"))
    for (const row of load) {
      assert.isBelow(
        value(row, "effect-ui"),
        value(row, "foldkit"),
        row.benchmark
      )
    }
  })
})
