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
    values: [7.1, 22.5, 47.3, 24.2, 23.8, 12.0, 12.5]
  },
  {
    benchmark: "02_replace1k",
    label: "Replace 1,000 rows",
    unit: "ms",
    values: [14.7, 33.7, 57.0, 42.8, 36.8, 23.7, 21.6]
  },
  {
    benchmark: "03_update10th1k_x16",
    label: "Update every 10th row",
    unit: "ms",
    slowdown: 4,
    values: [1.3, 23.2, 25.5, 12.8, 8.0, 3.6, 3.1]
  },
  {
    benchmark: "04_select1k",
    label: "Select a row",
    unit: "ms",
    slowdown: 4,
    values: [1.2, 7.5, 10.8, 9.0, 3.9, 7.1, 2.5]
  },
  {
    benchmark: "05_swap1k",
    label: "Swap two rows",
    unit: "ms",
    slowdown: 4,
    values: [0.8, 7.5, 8.6, 70.0, 4.0, 4.3, 3.5]
  },
  {
    benchmark: "06_remove-one-1k",
    label: "Remove a row",
    unit: "ms",
    slowdown: 2,
    values: [1.0, 3.6, 4.7, 3.6, 10.3, 1.7, 1.2]
  },
  {
    benchmark: "07_create10k",
    label: "Create 10,000 rows",
    unit: "ms",
    values: [69.1, 183, 408, 428, 209, 104, 94.4]
  },
  {
    benchmark: "08_create1k-after1k_x2",
    label: "Append 1,000 rows",
    unit: "ms",
    values: [7.3, 24.8, 45.3, 25.5, 23.1, 12.1, 10.9]
  },
  {
    benchmark: "09_clear1k_x8",
    label: "Clear 1,000 rows",
    unit: "ms",
    slowdown: 4,
    values: [34.6, 42.2, 61.6, 67.0, 56.8, 39.3, 42.3]
  }
]

export const load: ReadonlyArray<Row> = [
  {
    benchmark: "42_size-compressed",
    label: "Compressed size",
    unit: "kB",
    values: [2.5, 51.9, 86.8, 51.4, 23.3, 9.7, 4.5]
  },
  {
    benchmark: "43_first-paint",
    label: "First paint",
    unit: "ms",
    values: [71.9, 363, 737, 395, 165, 95.7, 71.5]
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

const commit = "b3995f2a9683e557f3c9dae3de2d006a19bc5268"
const base =
  `https://github.com/Effect-TS/ui/tree/${commit}/packages/ui/benchmark/js-framework-benchmark`

export const links = {
  methodology:
    `https://github.com/Effect-TS/ui/blob/${commit}/packages/ui/benchmark/js-framework-benchmark/README.md`,
  data: `${base}/results`
}
