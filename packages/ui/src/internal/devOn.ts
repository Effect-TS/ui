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
}

// `Html.KeyPayload`, which core code doesn't import.
interface Press {
  readonly key: string
  readonly shift: boolean
  readonly ctrl: boolean
  readonly alt: boolean
  readonly meta: boolean
  readonly composing: boolean
  readonly repeat: boolean
  readonly editable: boolean
  readonly selectionStart: number | null
  readonly selectionEnd: number | null
}

const keysOf = (row: Row): ReadonlyArray<string> => row.keys ?? [row.key!]

const named = (row: Row): string => JSON.stringify(keysOf(row).join(" "))

// Every combination of the flags a row's guards read, for `key`.
const pressesOf = (key: string): ReadonlyArray<Press> =>
  Array.from({ length: 64 }, (_, i) => ({
    key,
    ctrl: (i & 1) > 0,
    meta: (i & 2) > 0,
    alt: (i & 4) > 0,
    shift: (i & 8) > 0,
    editable: (i & 16) > 0,
    repeat: (i & 32) > 0,
    composing: false,
    selectionStart: null,
    selectionEnd: null
  }))

/**
 * Throws for a row no presses can fire: for each run of presses it accepts,
 * an earlier row completes on a shorter run of them, or is the first to match
 * or begin the whole run.
 */
export const checkSequences = <R extends Row>(
  table: ReadonlyArray<R>,
  matches: (row: R, key: string, press: Press) => boolean
): void => {
  for (let j = 0; j < table.length; j++) {
    const row = table[j]!
    const keys = keysOf(row)
    if (keys.length === 0) {
      throw new Error(
        "HtmlSubscription.keySequences: row " + j + " has no keys"
      )
    }
    let blocker: R | undefined
    // Whether press `m` on can reach `row`, with `alive` the earlier rows the presses so far fit.
    const reaches = (m: number, alive: ReadonlyArray<R>): boolean => {
      const seen = new Set<string>()
      for (const press of pressesOf(keys[m]!)) {
        if (!matches(row, keys[m]!, press)) continue
        const next = alive.filter((earlier) => {
          const want = keysOf(earlier)
          return want.length > m && want[m] === keys[m] &&
            matches(earlier, want[m]!, press)
        })
        const id = next.map((earlier) => alive.indexOf(earlier)).join()
        if (seen.has(id)) continue
        seen.add(id)
        const first = next[0]
        if (m + 1 === keys.length) {
          if (first === undefined) return true
        } else if (first === undefined || keysOf(first).length > m + 1) {
          if (reaches(m + 1, next)) return true
          continue
        }
        blocker ??= first
      }
      return false
    }
    if (!reaches(0, table.slice(0, j))) {
      throw new Error(
        "HtmlSubscription.keySequences: the row " + named(blocker!) +
          " makes the later row " + named(row) + " unreachable"
      )
    }
  }
}
