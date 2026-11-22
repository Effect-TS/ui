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
 * path or a key's `Row[b]`, and a root's name is its path as given.
 *
 * @internal
 */
export const segment = (view: View.Child<any, any>): string => segmentOf(view.component, view.key)

/**
 * `segment` of a child of `component` with `key`.
 *
 * @internal
 */
export const segmentOf = (component: Component.Any | Feature.Any, key: string): string =>
  escapeName(childName(component)) + "[" + escapeKey(key) + "]"

/**
 * Where paths are checked: a path, or an instance, whose path is read only for an error.
 *
 * @internal
 */
export type At = string | { readonly path: string }

const pathAt = (at: At): string => typeof at === "string" ? at : at.path

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
 * The paths one render of an instance uses, each with the child
 * that holds it: its view's children, then the children of each fallback shown
 * in this render, as they're shown.
 *
 * @internal
 */
export interface ChildPaths {
  readonly at: At
  /**
   * The children by their component's name, then by their key. A name and a key make one segment, and
   * two that differ make two, so this finds a taken path without writing every child's segment.
   */
  paths: Map<string, Map<string, View.Child<any, any>>> | undefined
  /** The slots the view places, its own outlets and those it forwards to its children. */
  placed: Set<string> | undefined
}

/** The paths of a tree that held a child and no outlet, once its render is over. */
const heldChildren: ChildPaths = Object.freeze({ at: "", paths: undefined, placed: undefined }) as any

/**
 * What an instance keeps of `paths` once its render is over. Fallbacks are only shown while their
 * instance renders, so the map of children by name and key goes. The placed slots, which its
 * author's checks read later, stay, and a tree that held a child keeps a value, so `h.lazy` can tell it
 * from one that held none.
 *
 * @internal
 */
export const settledPaths = (paths: ChildPaths | undefined): ChildPaths | undefined => {
  if (paths === undefined || paths.paths === undefined) return paths
  if (paths.placed === undefined) return heldChildren
  paths.paths = undefined
  return paths
}

const failure = (at: At, what: string): never => {
  throw new Error(`${pathAt(at)} renders two children ${what}`)
}

/**
 * Throws when two children of `tree`, at any depth below its elements,
 * have the same path. Two instances at one path would share a log path, a
 * server state entry and a hydration marker, so the parent fails instead.
 * Returns what the view uses, for its fallbacks.
 *
 * `last` is the tree the view rendered last time, when it held no child or
 * outlet: a node the new tree holds again at the same place, as `h.lazy`
 * gives it, holds none either, and is passed over. Places are compared below
 * elements a patch would pair, of one tag and key, as a list's rows are.
 *
 * @internal
 */
export const checkChildPaths = (
  at: At,
  tree: View.Node<any, any>,
  last?: View.Element<any, any> | undefined
): ChildPaths => {
  const paths: ChildPaths = { at, paths: undefined, placed: undefined }
  if (tree !== last) visit(paths, tree, undefined, "", last)
  return paths
}

/**
 * `checkChildPaths` for what a parent passed for a slot: a list of nodes, at the path of the outlet
 * that places them. The slots the content forwards aren't kept, since the tree that passed the content
 * counted them.
 *
 * @internal
 */
export const checkContentPaths = (at: At, nodes: ReadonlyArray<View.Node<any, any>>): ChildPaths => {
  const paths: ChildPaths = { at, paths: undefined, placed: undefined }
  for (const node of nodes) visit(paths, node, undefined, "")
  paths.placed = undefined
  return paths
}

/**
 * Adds the children of `tree` to `paths`, as rendered by the fallback of
 * `replaced`, or by the view without one. Throws on a path another
 * child holds. `replaced`'s own are free, since the child that failed there is
 * gone: its fallback's children take them over, so a fallback nested in
 * another fallback can reuse its child's path too.
 */
const visit = (
  paths: ChildPaths,
  node: View.Node<any, any>,
  replaced: View.Child<any, any> | undefined,
  where: string,
  last?: View.Element<any, any> | undefined
): void => {
  if (node._tag === "Element") {
    const children = node.children
    const before = last?.children
    for (let index = 0; index < children.length; index++) {
      const child = children[index]!
      const was = before?.[index]
      // Text and an element with no children hold no child: most of a view, passed over without a call.
      if (
        child !== was &&
        (child._tag === "Child" || child._tag === "Outlet" || (child._tag === "Element" && child.children.length > 0))
      ) {
        visit(paths, child, replaced, where, pairs(child, was) ? was : undefined)
      }
    }
  } else if (node._tag === "Child") {
    const name = childName(node.component)
    const byName = paths.paths ??= new Map()
    let taken = byName.get(name)
    if (taken === undefined) byName.set(name, taken = new Map())
    const holder = taken.get(node.key)
    if (holder !== undefined && holder !== replaced) {
      failure(paths.at, `at ${segment(node)}${where}${keyHint(name, node)}`)
    }
    taken.set(node.key, node)
    if (node.slots !== undefined) { for (const name in node.slots) visitPlaced(paths, node.slots[name]) }
  } else if (node._tag === "Outlet") {
    place(paths, node.name)
  }
}

/** Whether a patch would pair two elements: a row a list replaced isn't compared below. */
const pairs = (node: View.Node<any, any>, was: View.Node<any, any> | undefined): was is View.Element<any, any> =>
  was !== undefined && was._tag === "Element" && node._tag === "Element" && was.tag === node.tag &&
  was.elementKey === node.elementKey

// A missing key is a runtime error, not a type error, so the message names the fix.
const keyHint = (name: string, node: View.Child<any, any>): string =>
  node.key === ""
    ? `. A child without a key must be the only ${name} where it is rendered: give each ${name} its own \`key\``
    : `. Give each ${name} its own \`key\``

const place = (paths: ChildPaths, name: string): void => {
  const placed = paths.placed ??= new Set()
  if (placed.has(name)) throw new Error(`${pathAt(paths.at)} places its slot ${name} twice`)
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
 * at a path that another child holds: one of the view's, or a child of a
 * fallback already shown in this render. A fallback's children are the
 * parent's children, so they share its paths. Only `replaced`'s own path is
 * free, since the child that failed there is gone.
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
 * Throws when two of `written`, the paths of one author's view, of each
 * closure it gave a headless child and of the content it passed for a child's
 * slots, place one of the author's slots between them. Each tree's own are checked as it renders.
 *
 * @internal
 */
export const checkAuthorPlacements = (at: At, written: ReadonlyArray<ChildPaths>): void => {
  if (written.length < 2) return
  const taken = new Set<string>()
  for (const paths of written) {
    if (paths.placed === undefined) continue
    for (const name of paths.placed) {
      if (taken.has(name)) {
        throw new Error(`${pathAt(at)} places its slot ${name} twice, in the view it gives ${pathAt(paths.at)}`)
      }
      taken.add(name)
    }
  }
}

/** @internal */
export const checkAuthorWrites = (at: At, written: ReadonlyArray<ChildPaths>): void => {
  if (written.length < 2) return
  const taken = new Set<string>()
  for (const paths of written) {
    if (paths.paths === undefined) continue
    for (const byKey of paths.paths.values()) {
      for (const child of byKey.values()) {
        if (child.alive === undefined) continue
        const named = segment(child)
        if (taken.has(named)) throw new Error(`${pathAt(at)} writes ${named} twice in one render`)
        taken.add(named)
      }
    }
  }
}
