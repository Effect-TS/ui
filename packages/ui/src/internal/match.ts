/**
 * Which node of a render takes over which node of the render before it:
 * the rule the runtime patches by, and the one a scene follows to know
 * which mounts keep running.
 *
 * @internal
 */
import type * as View from "../View.ts"
import { segment } from "./paths.ts"

/**
 * Whether a node is matched among its siblings by key: a child, an outlet,
 * or an element with a key. Any other node is matched by position.
 *
 * @internal
 */
const isKeyed = (view: View.Node<any, any>): boolean =>
  view._tag === "Child" || view._tag === "Outlet" ||
  (view._tag === "Element" && view.elementKey !== undefined)

/**
 * A keyed node's key among its siblings.
 *
 * @internal
 */
const keyOf = (view: View.Node<any, any>): string =>
  view._tag === "Child" ?
    "c:" + segment(view) :
    view._tag === "Outlet" ?
    "o:" + view.name :
    "e:" + (view as View.Element<any, any>).tag + "[" +
    (view as View.Element<any, any>).elementKey + "]"

/**
 * Whether `view`, once matched with `old`, patches it rather than replacing
 * it: an element of the same tag, a child of the same component, an outlet
 * of the same name, or text.
 *
 * @internal
 */
export const same = (
  old: View.Node<any, any>,
  view: View.Node<any, any>
): boolean => {
  switch (old._tag) {
    case "Child":
      return view._tag === "Child" && old.component === view.component
    case "Element":
      return view._tag === "Element" && old.tag === view.tag
    case "Text":
      return view._tag === "Text"
    case "Outlet":
      return view._tag === "Outlet" && old.name === view.name
  }
}

/**
 * Whether `view` patches `old` where one node replaces another, as a view's
 * root does: the same kind of node, keyed alike, with the same key.
 *
 * @internal
 */
export const patches = (
  old: View.Node<any, any>,
  view: View.Node<any, any>
): boolean =>
  same(old, view) && isKeyed(old) === isKeyed(view) &&
  (!isKeyed(view) || keyOf(old) === keyOf(view))

/**
 * For each of `news`, the index of the old node it patches, or -1 when it's
 * created. The runtime's list patch: the common prefix and then the common
 * suffix pair up in place, and in between a keyed node takes the old with
 * its key, wherever it was, and any other node the unkeyed old at its own
 * index. The olds no node takes are removed.
 *
 * @internal
 */
export const matchSiblings = (
  olds: ReadonlyArray<View.Node<any, any>>,
  news: ReadonlyArray<View.Node<any, any>>
): ReadonlyArray<number> => {
  let start = 0
  let oldEnd = olds.length - 1
  let end = news.length - 1
  while (
    start <= oldEnd && start <= end && patches(olds[start]!, news[start]!)
  ) start++
  while (
    start <= oldEnd && start <= end && patches(olds[oldEnd]!, news[end]!)
  ) {
    oldEnd--
    end--
  }
  let byKey: Map<string, number> | undefined
  for (let index = start; index <= oldEnd; index++) {
    const old = olds[index]!
    if (isKeyed(old)) (byKey ??= new Map()).set(keyOf(old), index)
  }
  return news.map((view, index) => {
    if (index < start) return index
    if (index > end) return index + olds.length - news.length
    if (isKeyed(view)) {
      const found = byKey?.get(keyOf(view))
      if (found === undefined || !same(olds[found]!, view)) return -1
      // A second node with the key is created: the runtime throws on it.
      byKey!.delete(keyOf(view))
      return found
    }
    const old = index <= oldEnd ? olds[index] : undefined
    return old !== undefined && !isKeyed(old) && same(old, view) ? index : -1
  })
}
