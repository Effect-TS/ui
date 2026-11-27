import type * as View from "../View.ts"
import type { Instance, Rec } from "./kernel.ts"
import {
  checkChildPaths,
  checkContentPaths,
  checkFallbackPaths,
  type ChildPaths
} from "./paths.ts"

export const dev: boolean = true

export const checkKeys = (
  path: string,
  views: ReadonlyArray<View.Node<any, any>>
): void => {
  let seen: Set<string> | undefined
  for (let index = 0; index < views.length; index++) {
    const view = views[index]!
    if (view._tag !== "Element" || view.elementKey === undefined) continue
    const key = view.tag + "[" + view.elementKey + "]"
    if ((seen ??= new Set()).has(key)) {
      throw new Error(path + ": two siblings share the key " + key)
    }
    seen.add(key)
  }
}

export const checkPaths = (
  inst: Instance,
  tree: View.Node<any, any>
): Instance | undefined => {
  const placed = checkChildPaths(inst.path, tree).placed
  if (placed === undefined) placedBy.delete(inst)
  else placedBy.set(inst, placed)
  const at = inst.at
  if (at === undefined || (at.v as View.Child<any, any>).view === undefined) {
    return undefined
  }
  const author = inst.parent!
  if (authors.has(author)) return undefined
  authors.add(author)
  return author
}

const placedBy = new WeakMap<Instance, ReadonlySet<string>>()
const authors = new Set<Instance>()

export const checkPlaced = (author: Instance): void => {
  authors.delete(author)
  if (author.closed || author.rendered === undefined) return
  const taken = new Set(placedBy.get(author))
  const visit = (rec: Rec): void => {
    const view = rec.v
    if (view._tag === "Child") {
      if (rec.kids !== undefined || view.view === undefined) return
      const inst = rec.inst
      for (const name of placedBy.get(inst) ?? []) {
        if (taken.has(name)) {
          throw new Error(
            author.path + " places its slot " + name +
              " twice, in the view it gives " + inst.path
          )
        }
        taken.add(name)
      }
      if (inst.rendered !== undefined) visit(inst.rendered)
    } else if (view._tag === "Element" && rec.kids !== undefined) {
      for (const kid of rec.kids) visit(kid)
    }
  }
  visit(author.rendered)
}

export const checkContent = (
  path: string,
  views: ReadonlyArray<View.Node<any, any>>
): void => {
  if (views.length > 1) checkKeys(path, views)
  checkContentPaths(path, views)
}

export const checkShown = (
  path: string,
  recs: ReadonlyArray<Rec>,
  content?: boolean
): void => {
  const paths = checkContentPaths(path, recs.map((rec) => rec.v))
  for (let index = 0; index < recs.length; index++) {
    shownIn(paths, recs[index]!, content === true)
  }
}

const shownIn = (paths: ChildPaths, rec: Rec, content: boolean): void => {
  const view = rec.v
  const kids = rec.kids
  if (kids === undefined || view._tag === "Outlet") return
  if (view._tag === "Child") {
    if (content && view.alive !== undefined) return
    checkFallbackPaths(paths, view, kids[0]!.v)
    shownIn(paths, kids[0]!, content)
  } else {for (let index = 0; index < kids.length; index++) {
      shownIn(paths, kids[index]!, content)
    }}
}

export const checkLayers = (
  inst: Instance,
  layers: ReadonlyArray<
    Pick<View.Element<any, any>, "eventOptions"> & {
      readonly owner?: View.Owner
    }
  >
): void => {
  const set = new Set<string>()
  for (const layer of layers) {
    const owner = layer.owner as Instance | undefined
    if (owner?.closed) {
      throw new Error(
        inst.path + ": a part of " + owner.path +
          " was applied outside its view"
      )
    }
    for (const event in layer.eventOptions) {
      const option = layer.eventOptions[event] as Readonly<
        Record<string, unknown>
      >
      for (const key in option) {
        if (key === "preventDefault" || option[key] === undefined) continue
        if (set.has(event + " " + key)) {
          throw new Error(
            inst.path + ": two owners set the " + key + " option of " + event +
              " on one element"
          )
        }
        set.add(event + " " + key)
      }
    }
  }
}

export const checkFallback = (
  path: string,
  view: View.Child<any, any>
): void => {
  if (view.fallback === undefined) {
    throw new Error(
      path + ": " + (view.component as { readonly key: string }).key +
        " isn't available, because a Layer above it is still building or failed. Pass `fallback`."
    )
  }
}

export const checkDeclarer = (inst: Instance, view: View.Outlet): void => {
  if (inst.parent === undefined) {
    throw new Error(
      inst.path + " places the slot " + view.name + ", and is a root"
    )
  }
}

interface Row {
  readonly key?: string | undefined
  readonly keys?: ReadonlyArray<string> | undefined
  readonly mod?: boolean | undefined
  readonly shift?: boolean | undefined
  readonly ctrl?: boolean | undefined
  readonly alt?: boolean | undefined
  readonly meta?: boolean | undefined
  readonly whileTyping?: boolean | undefined
  readonly repeat?: boolean | undefined
}

const keysOf = (row: Row): ReadonlyArray<string> => row.keys ?? [row.key!]

// The `[ctrl, meta]` pairs a row accepts.
const ctrlMeta = (row: Row): ReadonlyArray<string> =>
  row.mod === true
    ? ["10", "01"]
    : [Number(row.ctrl === true) + "" + Number(row.meta === true)]

// Whether every press `b` accepts at a position, `a` accepts there too.
const covers = (a: Row, b: Row): boolean =>
  ctrlMeta(b).every((pair) => ctrlMeta(a).includes(pair)) &&
  (a.alt === true) === (b.alt === true) &&
  (a.shift === undefined || a.shift === b.shift) &&
  (a.whileTyping === true || b.whileTyping !== true) &&
  (a.repeat === true || b.repeat !== true)

const named = (row: Row): string => JSON.stringify(keysOf(row).join(" "))

export const checkSequences = (table: ReadonlyArray<Row>): void => {
  for (let j = 0; j < table.length; j++) {
    const later = table[j]!
    const keys = keysOf(later)
    if (keys.length === 0) {
      throw new Error(
        "HtmlSubscription.keySequences: row " + j + " has no keys"
      )
    }
    for (let i = 0; i < j; i++) {
      const earlier = table[i]!
      const before = keysOf(earlier)
      // An earlier row that completes or begins every press run of a later one takes it first.
      if (
        covers(earlier, later) &&
        before.slice(0, keys.length).every((key, k) => key === keys[k])
      ) {
        throw new Error(
          "HtmlSubscription.keySequences: the row " + named(earlier) +
            " makes the later row " + named(later) + " unreachable"
        )
      }
    }
  }
}
