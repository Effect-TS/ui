/**
 * The checks that only catch an author's mistake, and their messages. The package's `#dev` import
 * resolves here unless the `production` condition is set, which resolves it to `devOff.ts`.
 */
import type * as View from "../View.ts"
import type { Instance, Rec } from "./kernel.ts"
import {
  checkChildPaths,
  checkContentPaths,
  checkFallbackPaths,
  type ChildPaths
} from "./paths.ts"

/** Whether the checks run. A bundler that folds constants drops every `if (dev)` under `production`. */
export const dev: boolean = true

/** Throws for two sibling elements of one tag and key, as the diff would give one of them the other's node. */
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

/**
 * Throws for two children of one view, at any depth, at one path: they would share a log path. Returns
 * the author of a headless child's closure, the first time since its placed slots were last checked.
 */
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

/**
 * Throws when two trees of `author`'s, its view and the closures it gave headless children, place one of
 * its slots. Run once all of them are current.
 */
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

/** `checkKeys` and `checkPaths` for the content a slot places, at the slot's path. */
export const checkContent = (
  path: string,
  views: ReadonlyArray<View.Node<any, any>>
): void => {
  if (views.length > 1) checkKeys(path, views)
  checkContentPaths(path, views)
}

/**
 * Throws for a child a fallback shows at a path another child of the same tree holds: one of the view's,
 * or one another fallback shows. Only the path of the child a fallback stands in for is free.
 */
export const checkShown = (path: string, recs: ReadonlyArray<Rec>): void => {
  const paths = checkContentPaths(path, recs.map((rec) => rec.v))
  for (let index = 0; index < recs.length; index++) shownIn(paths, recs[index]!)
}

const shownIn = (paths: ChildPaths, rec: Rec): void => {
  const view = rec.v
  const kids = rec.kids
  if (kids === undefined || view._tag === "Outlet") return
  if (view._tag === "Child") {
    checkFallbackPaths(paths, view, kids[0]!.v)
    shownIn(paths, kids[0]!)
  } else {for (let index = 0; index < kids.length; index++) {
      shownIn(paths, kids[index]!)
    }}
}

/**
 * Throws for a part applied where its owner has closed, outside the view it was made for, and for two
 * layers of one element that set one option of an event other than `preventDefault`.
 */
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
