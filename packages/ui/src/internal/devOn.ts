/**
 * The checks that only catch an author's mistake, and their messages. The package's `#dev` import
 * resolves here unless the `production` condition is set, which resolves it to `devOff.ts`.
 */
import type * as View from "../View.ts"

/** Whether the checks run. A bundler that folds constants drops every `if (dev)` under `production`. */
export const dev: boolean = true

/** Throws for two siblings found by the same key, as the diff would give one of them the other's node. */
export const checkKeys = (path: string, views: ReadonlyArray<View.Node<any, any>>): void => {
  // An element and a child can share a key: they are never each other's.
  const elements = new Set<unknown>()
  const children = new Set<unknown>()
  for (let index = 0; index < views.length; index++) {
    const view = views[index]!
    if (view._tag !== "Element" && view._tag !== "Child") continue
    const key = view._tag === "Element" ? view.elementKey : view.key === "" ? view.component : view.key
    if (key === undefined) continue
    const seen = view._tag === "Element" ? elements : children
    if (seen.has(key)) {
      throw new Error(
        view._tag === "Child" && view.key === ""
          ? path + ": two children of " + (view.component as any).definition?.name +
            " have no key. Give each a key."
          : path + ": two siblings have the key " + String(view._tag === "Child" ? view.key : key) +
            ". Keys are unique among siblings."
      )
    }
    seen.add(key)
  }
}
