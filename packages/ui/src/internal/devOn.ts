/**
 * The checks that only catch an author's mistake, and their messages. The package's `#dev` import
 * resolves here unless the `production` condition is set, which resolves it to `devOff.ts`.
 */
import type * as View from "../View.ts"
import { checkChildPaths, checkContentPaths } from "./paths.ts"

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

/** `checkPaths` for the content a slot places, at the slot's path. */
export const checkContent = (
  path: string,
  views: ReadonlyArray<View.Node<any, any>>
): void => {
  checkContentPaths(path, views)
}
