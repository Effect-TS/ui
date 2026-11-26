const adjectives = [
  "pretty",
  "large",
  "big",
  "small",
  "tall",
  "short",
  "long",
  "handsome",
  "plain",
  "quaint",
  "clean",
  "elegant",
  "easy",
  "angry",
  "crazy",
  "helpful",
  "mushy",
  "odd",
  "unsightly",
  "adorable",
  "important",
  "inexpensive",
  "cheap",
  "expensive",
  "fancy"
]
const colours = [
  "red",
  "yellow",
  "blue",
  "green",
  "pink",
  "brown",
  "purple",
  "brown",
  "white",
  "black",
  "orange"
]
const nouns = [
  "table",
  "chair",
  "house",
  "bbq",
  "desk",
  "car",
  "pony",
  "cookie",
  "sandwich",
  "burger",
  "pizza",
  "mouse",
  "keyboard"
]

const random = (max: number) => Math.round(Math.random() * 1000) % max

export interface Row {
  readonly id: number
  readonly label: string
}

export const buildRows = (nextId: number, count: number): Array<Row> =>
  Array.from({ length: count }, (_, index) => ({
    id: nextId + index,
    label: adjectives[random(adjectives.length)] + " " +
      colours[random(colours.length)] + " " + nouns[random(nouns.length)]
  }))

export interface State {
  readonly rows: ReadonlyArray<Row>
  readonly selected: number
  readonly nextId: number
}

export type Msg =
  | {
    readonly _tag: "Run" | "RunLots" | "Add" | "Update" | "Clear" | "SwapRows"
  }
  | { readonly _tag: "Select" | "Remove"; readonly id: number }

const replaceRows = (model: State, count: number): State => ({
  rows: buildRows(model.nextId, count),
  selected: 0,
  nextId: model.nextId + count
})

/** The benchmark's update, shared by the @effect/ui and React versions. */
export const reduce = (model: State, message: Msg): State => {
  switch (message._tag) {
    case "Run":
      return replaceRows(model, 1000)
    case "RunLots":
      return replaceRows(model, 10000)
    case "Add":
      return {
        ...model,
        rows: [...model.rows, ...buildRows(model.nextId, 1000)],
        nextId: model.nextId + 1000
      }
    case "Update":
      return {
        ...model,
        rows: model.rows.map((row, i) =>
          i % 10 === 0 ? { ...row, label: row.label + " !!!" } : row
        )
      }
    case "Clear":
      return { ...model, rows: [], selected: 0 }
    case "SwapRows": {
      if (model.rows.length <= 998) return model
      const rows = [...model.rows]
      const row1 = rows[1]
      rows[1] = rows[998]
      rows[998] = row1
      return { ...model, rows }
    }
    case "Select":
      return { ...model, selected: message.id }
    case "Remove":
      return {
        ...model,
        rows: model.rows.filter((row) => row.id !== message.id)
      }
  }
}
