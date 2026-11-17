/**
 * Child paths: the segment a child adds to its parent's path, and the
 * check that no two children of one view share a path.
 *
 * @internal
 */
import type * as Component from "../Component.ts"
import * as Feature from "../Feature.ts"
import type * as View from "../View.ts"

/** @internal */
export const childName = (component: Component.Any | Feature.Any): string =>
  Feature.isService(component) ? component[Feature.TypeId].name : component.definition.name

/**
 * The segment a child adds to its parent's path: `Name[key]`.
 *
 * A segment's name ends at its first `[`, and the segment at its first `]/`
 * or at the end of the path. So a name's `[` is written as `%5B`, the `/`
 * of a key's `]/` as `%2F`, and `%` as `%25` in both. Two different children
 * never share a path: a key `a]/B[b` can't stand for a grandchild. Names
 * and keys keep `/` and brackets otherwise, as in `test/Badge`, a route
 * path or a ref's `Row[b]`, and a root's name is its path as given.
 *
 * @internal
 */
export const segment = (view: View.Child<any, any>): string =>
  escapeName(childName(view.component)) + "[" + escapeKey(view.key) + "]"

/**
 * The path segment of a placed slot: its name in brackets, escaped as a key is. No child's segment
 * starts with a bracket, since a component's name escapes one.
 *
 * @internal
 */
export const slotSegment = (name: string): string => "[" + escapeKey(name) + "]"

// Most names and keys need no escaping, so the regular expressions run only for those that do.
const escapeName = (name: string): string =>
  name.includes("%") || name.includes("[") ? name.replace(/[%[]/g, escapeChar) : name
const escapeKey = (key: string): string =>
  key.includes("%") || key.includes("]/") ? key.replace(/%|(?<=\])\//g, escapeChar) : key

const escapeChar = (char: string): string => "%" + char.charCodeAt(0).toString(16).toUpperCase()

/**
 * The paths and ref keys one render of an instance uses, each with the child
 * that holds it: its view's children, then the children of each fallback shown
 * in this render, as they're shown.
 *
 * @internal
 */
export interface ChildPaths {
  readonly path: string
  // Each Map is made for its first entry: most views render no child, and none with a ref.
  /**
   * The children by their component's name, then by their key. A name and a key make one segment, and
   * two that differ make two, so this finds a taken path without writing every child's segment.
   */
  paths: Map<string, Map<string, View.Child<any, any>>> | undefined
  refs: Map<string, View.Child<any, any>> | undefined
  /** The slots the view places, its own outlets and those it forwards to its children. */
  placed: Set<string> | undefined
}

const failure = (path: string, what: string): never => {
  throw new Error(`${path} renders two children ${what}`)
}

/**
 * Throws when two children of `tree`, at any depth below its elements,
 * have the same path, or were rendered with refs that have the same key. Two
 * instances at one path would share a log path, a server state entry and a
 * hydration marker, and a send matches a child by its ref's key alone, so the
 * parent fails instead. Returns what the view uses, for its fallbacks.
 *
 * @internal
 */
export const checkChildPaths = (path: string, tree: View.Node<any, any>): ChildPaths => {
  const paths: ChildPaths = { path, paths: undefined, refs: undefined, placed: undefined }
  visit(paths, tree, undefined, "")
  return paths
}

/**
 * Adds the children of `tree` to `paths`, as rendered by the fallback of
 * `replaced`, or by the view without one. Throws on a path or ref key another
 * child holds. `replaced`'s own are free, since the child that failed there is
 * gone: its fallback's children take them over, so a fallback nested in
 * another fallback can reuse its child's path too.
 */
const visit = (
  paths: ChildPaths,
  node: View.Node<any, any>,
  replaced: View.Child<any, any> | undefined,
  where: string
): void => {
  if (node._tag === "Element") {
    const children = node.children
    for (let index = 0; index < children.length; index++) {
      const child = children[index]!
      // Text and an element with no children hold no child: most of a view, passed over without a call.
      if (
        child._tag === "Child" || child._tag === "Outlet" || (child._tag === "Element" && child.children.length > 0)
      ) {
        visit(paths, child, replaced, where)
      }
    }
  } else if (node._tag === "Child") {
    const name = childName(node.component)
    const byName = paths.paths ??= new Map()
    let taken = byName.get(name)
    if (taken === undefined) byName.set(name, taken = new Map())
    const holder = taken.get(node.key)
    if (holder !== undefined && holder !== replaced) failure(paths.path, `at ${segment(node)}${where}`)
    taken.set(node.key, node)
    const ref = node.ref
    if (ref !== undefined) {
      const refs = paths.refs ??= new Map()
      const refHolder = refs.get(ref.key)
      if (refHolder !== undefined && refHolder !== replaced) failure(paths.path, `with the ref ${ref.key}${where}`)
      refs.set(ref.key, node)
    }
    if (node.slots !== undefined) { for (const name in node.slots) visitPlaced(paths, node.slots[name]) }
  } else if (node._tag === "Outlet") {
    place(paths, node.name)
  }
}

const place = (paths: ChildPaths, name: string): void => {
  const placed = paths.placed ??= new Set()
  if (placed.has(name)) throw new Error(`${paths.path} places its slot ${name} twice`)
  placed.add(name)
}

/** Counts the outlets in what a view passes to a child's slot: placing them there forwards them. */
const visitPlaced = (paths: ChildPaths, input: unknown): void => {
  if (input === null || typeof input !== "object") return
  if (Array.isArray(input)) {
    for (const item of input) visitPlaced(paths, item)
    return
  }
  const node = input as View.Node<any, any>
  if (node._tag === "Outlet") place(paths, node.name)
  else if (node._tag === "Element") { for (const child of node.children) visitPlaced(paths, child) }
  else if (node._tag === "Child" && node.slots !== undefined) {
    for (const name in node.slots) visitPlaced(paths, node.slots[name])
  }
}

/**
 * Throws when `fallback`, shown in place of the child `replaced`, renders a child
 * at a path or ref key that another child holds: one of the view's, or a child
 * of a fallback already shown in this render. A fallback's children are the
 * parent's children, so they share its paths. Only `replaced`'s own path and ref
 * key are free, since the child that failed there is gone.
 *
 * @internal
 */
export const checkFallbackPaths = (
  paths: ChildPaths,
  replaced: View.Child<any, any>,
  fallback: View.Node<any, any>
): void => {
  visit(paths, fallback, replaced, `, in the fallback of ${segment(replaced)}`)
}

/**
 * Throws when two of `written`, the paths of one author's view and of each
 * closure it gave a headless child, hold children with refs of one key. The
 * author wrote all of them, and a send finds a child by its ref's key alone,
 * across all of them. One view's own refs are checked as it renders.
 *
 * @internal
 */
export const checkAuthorRefs = (path: string, written: ReadonlyArray<ChildPaths>): void => {
  const taken = new Set<string>()
  for (const paths of written) {
    if (paths.refs === undefined) continue
    for (const key of paths.refs.keys()) {
      if (taken.has(key)) failure(path, `with the ref ${key}, in the view it gives ${paths.path}`)
      taken.add(key)
    }
  }
}

/**
 * Throws when two of `placing`, the paths of one author's view and of each
 * closure it gave a headless child, place one of its slots between them. Each
 * tree's own are checked as it renders. Content the author passes to a child is
 * left out: its view counted the slots it forwards there.
 *
 * @internal
 */
export const checkAuthorPlacements = (path: string, placing: ReadonlyArray<ChildPaths>): void => {
  if (placing.length < 2) return
  const taken = new Set<string>()
  for (const paths of placing) {
    if (paths.placed === undefined) continue
    for (const name of paths.placed) {
      if (taken.has(name)) throw new Error(`${path} places its slot ${name} twice, in the view it gives ${paths.path}`)
      taken.add(name)
    }
  }
}
