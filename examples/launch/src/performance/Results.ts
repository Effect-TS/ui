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
    values: [7.0, 24.6, 45.6, 25.8, 23.4, 11.5, 10.9]
  },
  {
    benchmark: "02_replace1k",
    label: "Replace 1,000 rows",
    unit: "ms",
    values: [14.5, 34.0, 60.3, 48.1, 34.5, 23.1, 22.6]
  },
  {
    benchmark: "03_update10th1k_x16",
    label: "Update every 10th row",
    unit: "ms",
    slowdown: 4,
    values: [1.4, 18.3, 28.6, 14.5, 8.2, 4.0, 3.2]
  },
  {
    benchmark: "04_select1k",
    label: "Select a row",
    unit: "ms",
    slowdown: 4,
    values: [1.1, 7.1, 10.8, 9.6, 3.8, 7.4, 2.6]
  },
  {
    benchmark: "05_swap1k",
    label: "Swap two rows",
    unit: "ms",
    slowdown: 4,
    values: [0.8, 6.7, 8.5, 64.2, 4.2, 5.2, 4.2]
  },
  {
    benchmark: "06_remove-one-1k",
    label: "Remove a row",
    unit: "ms",
    slowdown: 2,
    values: [1.0, 3.3, 4.2, 3.5, 10.1, 1.9, 1.5]
  },
  {
    benchmark: "07_create10k",
    label: "Create 10,000 rows",
    unit: "ms",
    values: [69.8, 182, 415, 430, 231, 109, 104]
  },
  {
    benchmark: "08_create1k-after1k_x2",
    label: "Append 1,000 rows",
    unit: "ms",
    values: [7.4, 26.1, 44.4, 26.2, 23.2, 11.9, 11.7]
  },
  {
    benchmark: "09_clear1k_x8",
    label: "Clear 1,000 rows",
    unit: "ms",
    slowdown: 4,
    values: [31.9, 45.6, 59.7, 72.0, 54.7, 35.8, 47.2]
  }
]

export const load: ReadonlyArray<Row> = [
  {
    benchmark: "42_size-compressed",
    label: "Compressed size",
    unit: "kB",
    values: [2.5, 51.7, 86.8, 51.4, 23.3, 9.7, 4.5]
  },
  {
    benchmark: "43_first-paint",
    label: "First paint",
    unit: "ms",
    values: [76.3, 385, 685, 547, 193, 90.5, 78.2]
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
    values: [1.9, 4.2, 6.1, 4.4, 3.9, 2.9, 2.7]
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
