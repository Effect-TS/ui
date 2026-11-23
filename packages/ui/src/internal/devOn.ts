/**
 * The checks that only catch an author's mistake, and their messages. The package's `#dev` import
 * resolves here unless the `production` condition is set, which resolves it to `devOff.ts`.
 */
import type * as View from "../View.ts"
import type { Rec } from "./kernel.ts"
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

/** Throws for two children of one view, at any depth, at one path: they would share a log path. */
export const checkPaths = (path: string, tree: View.Node<any, any>): void => {
  checkChildPaths(path, tree)
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
