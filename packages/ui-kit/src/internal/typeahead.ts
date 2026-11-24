import { available, type Labelled } from "./list.ts"

const matchOf = (
  items: ReadonlyArray<Labelled>,
  text: string,
  start: number
): number => {
  if (items.length === 0) return -1
  const lower = text.toLowerCase()
  const from = ((start % items.length) + items.length) % items.length
  for (let offset = 0; offset < items.length; offset++) {
    const index = (from + offset) % items.length
    const item = items[index]!
    if (available(item) && item.label.toLowerCase().startsWith(lower)) {
      return index
    }
  }
  return -1
}

export interface Typed {
  readonly typed: string
  readonly typedFrom: number
  readonly matched: number
}

export const typeahead = (
  state: Typed,
  key: string,
  items: ReadonlyArray<Labelled>,
  from: number
): { readonly next: Typed; readonly index: number } => {
  let typed = state.typed
  let typedFrom = typed === "" ? from : state.typedFrom
  const cycles = items.every((item) =>
    !available(item) ||
    item.label[0]?.toLowerCase() !== item.label[1]?.toLowerCase()
  )
  if (cycles && typed === key) {
    typed = ""
    typedFrom = state.matched
  }
  typed += key
  const index = matchOf(items, typed, typedFrom + 1)
  if (index !== -1) return { next: { typed, typedFrom, matched: index }, index }
  return {
    next: {
      typed: key === " " ? typed : "",
      typedFrom,
      matched: state.matched
    },
    index
  }
}

export const printable = (
  key: string,
  alt: boolean,
  ctrl: boolean,
  meta: boolean
): boolean => key.length === 1 && !alt && !ctrl && !meta
