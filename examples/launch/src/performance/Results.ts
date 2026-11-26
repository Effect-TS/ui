export const frameworks = [
  "vanillajs",
  "effect-ui",
  "foldkit",
  "react-hooks",
  "vue",
  "svelte",
  "solid"
] as const
export type Framework = typeof frameworks[number]

// The order the tables show them in: the baseline, then Effect UI
// beside the two a reader is likeliest to compare it with.
export const columns: ReadonlyArray<Framework> = [
  "vanillajs",
  "effect-ui",
  "react-hooks",
  "foldkit",
  "vue",
  "svelte",
  "solid"
]

export const names: Record<Framework, string> = {
  vanillajs: "Vanilla JS",
  "effect-ui": "Effect UI",
  foldkit: "Foldkit 0.x",
  "react-hooks": "React",
  vue: "Vue",
  svelte: "Svelte",
  solid: "Solid"
}

export interface Row {
  readonly benchmark: string
  readonly label: string
  readonly unit: "ms" | "MB" | "kB"
  readonly slowdown?: number
  readonly values: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number
  ]
}

export const script: ReadonlyArray<Row> = [
  {
    benchmark: "01_run1k",
    label: "Create 1,000 rows",
    unit: "ms",
    values: [6.9, 23.3, 41.6, 23.6, 22.9, 11.5, 10.1]
  },
  {
    benchmark: "02_replace1k",
    label: "Replace 1,000 rows",
    unit: "ms",
    values: [15.4, 32.0, 55.5, 41.3, 33.3, 22.6, 21.3]
  },
  {
    benchmark: "03_update10th1k_x16",
    label: "Update every 10th row",
    unit: "ms",
    slowdown: 4,
    values: [1.1, 16.1, 24.0, 12.9, 7.3, 3.4, 2.8]
  },
  {
    benchmark: "04_select1k",
    label: "Select a row",
    unit: "ms",
    slowdown: 4,
    values: [0.8, 6.9, 10.3, 8.4, 3.4, 7.3, 2.7]
  },
  {
    benchmark: "05_swap1k",
    label: "Swap two rows",
    unit: "ms",
    slowdown: 4,
    values: [0.6, 6.3, 8.3, 62.3, 3.8, 4.7, 3.3]
  },
  {
    benchmark: "06_remove-one-1k",
    label: "Remove a row",
    unit: "ms",
    slowdown: 2,
    values: [1.0, 3.1, 4.1, 3.6, 8.5, 1.7, 1.1]
  },
  {
    benchmark: "07_create10k",
    label: "Create 10,000 rows",
    unit: "ms",
    values: [68.8, 181, 399, 422, 203, 101, 93.7]
  },
  {
    benchmark: "08_create1k-after1k_x2",
    label: "Append 1,000 rows",
    unit: "ms",
    values: [7.3, 25.2, 43.4, 25.7, 22.3, 12.7, 10.6]
  },
  {
    benchmark: "09_clear1k_x8",
    label: "Clear 1,000 rows",
    unit: "ms",
    slowdown: 4,
    values: [30.9, 40.0, 57.5, 64.3, 46.5, 36.1, 40.6]
  }
]

export const load: ReadonlyArray<Row> = [
  {
    benchmark: "42_size-compressed",
    label: "Compressed size",
    unit: "kB",
    values: [2.5, 52.8, 87.0, 51.4, 23.3, 9.7, 4.5]
  },
  {
    benchmark: "43_first-paint",
    label: "First paint",
    unit: "ms",
    values: [64.8, 381, 691, 419, 154, 106, 68.2]
  },
  {
    benchmark: "21_ready-memory",
    label: "Memory after load",
    unit: "MB",
    values: [0.6, 1.2, 2.3, 1.2, 0.9, 0.7, 0.6]
  },
  {
    benchmark: "22_run-memory",
    label: "Memory with 1,000 rows",
    unit: "MB",
    values: [1.9, 4.1, 6.1, 4.4, 3.9, 2.9, 2.7]
  }
]

export const value = (row: Row, framework: Framework): number =>
  row.values[frameworks.indexOf(framework)]!

export interface Summary {
  readonly framework: Framework
  readonly multiple: number
}

export const summary: ReadonlyArray<Summary> = frameworks.map((
  framework
) => ({
  framework,
  multiple: Math.exp(
    script.reduce(
      (sum, row) =>
        sum +
        Math.log(value(row, framework) / value(row, "vanillajs")),
      0
    ) / script.length
  )
})).sort((a, b) => a.multiple - b.multiple)

export const format = (x: number): string =>
  x >= 100 ? x.toFixed(0) : x.toFixed(1)

const repo = "https://github.com/Effect-TS/ui"
const dir = "main/packages/ui/benchmark/js-framework-benchmark"

export const links = {
  methodology: `${repo}/blob/${dir}/README.md`,
  data: `${repo}/tree/${dir}/results`
}
