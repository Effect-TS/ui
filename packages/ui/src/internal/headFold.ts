import type * as Head from "../Head.ts"

/** @internal */
export interface Folding<E, H> {
  readonly combine: (node: Head.Tree<E, H>, children: ReadonlyArray<H>, conflicted: ReadonlySet<string>) => H
  /** The single slots a value holds, each with a signature of its value. */
  readonly slots: (head: H) => ReadonlyMap<string, string>
}

interface Folded<H> {
  readonly head: H
  readonly slots: ReadonlyMap<string, string>
  readonly from: ReadonlyMap<string, ReadonlyArray<string>>
  readonly conflicts: ReadonlyMap<string, ReadonlyArray<string>>
}

const plainMerges = new WeakSet<Function>()

/**
 * Marks `merge` as a merge that calls `fold` with the tree it was given, and does nothing else with
 * that tree.
 *
 * @internal
 */
export const plain = <F extends Function>(merge: F): F => {
  plainMerges.add(merge)
  return merge
}

/**
 * Whether a merge gives the same value and conflicts for a tree without its subtrees that have no
 * entries and no `reduce` anywhere. `fold` folds each of them to nothing and leaves it out, so such a
 * merge can be given a tree without them. Any other merge sees the tree as the runtime built it.
 *
 * @internal
 */
export const skipsEmpty = (merge: Function): boolean => plainMerges.has(merge)

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

const byPath = (a: Head.Tree<any, any>, b: Head.Tree<any, any>): number => compare(a.path ?? "", b.path ?? "")

const noSlots = new Map<string, never>()
const noConflicts: ReadonlySet<string> = new Set()

const add = (into: Map<string, Array<string>>, slot: string, paths: ReadonlyArray<string>) => {
  const list = into.get(slot)
  if (list === undefined) into.set(slot, [...paths])
  else list.push(...paths)
}

/** @internal */
export const fold = <E, H>(
  tree: Head.Tree<E, H>,
  folding: Folding<E, H>,
  onConflict: ((slot: string, paths: ReadonlyArray<string>) => void) | undefined
): H => {
  const nothing: Folded<H> = {
    head: folding.combine({ entries: [], children: [] }, [], noConflicts),
    slots: noSlots,
    from: noSlots,
    conflicts: noSlots
  }
  const visit = (node: Head.Tree<E, H>): Folded<H> => {
    const reduce = node.reduce
    const below = node.children.length > 1 ? [...node.children].sort(byPath) : node.children
    const children: Array<Folded<H>> = []
    const values = reduce === undefined ? undefined : new Map<string, H>()
    let last: Head.Tree<E, H> | undefined
    for (const child of below) {
      const folded = visit(child)
      if (folded === nothing) continue
      if (last !== undefined && last.path === child.path) {
        throw new Error(
          `Head: two siblings ${child.path === undefined ? "have no path" : `share the path ${child.path}`}, ` +
            "so their order is ambiguous. Give each sibling with head entries its own path"
        )
      }
      last = child
      children.push(folded)
      if (values !== undefined && child.path !== undefined) values.set(child.path, folded.head)
    }
    if (node.entries.length === 0 && reduce === undefined && children.length < 2) return children[0] ?? nothing
    const path = node.path ?? ""
    const from = new Map<string, Array<string>>()
    const conflicts = new Map<string, Array<string>>()
    const signatures = new Map<string, string>()
    for (const child of children) {
      for (const [slot, paths] of child.conflicts) add(conflicts, slot, paths)
      for (const [slot, signature] of child.slots) {
        const set = signatures.get(slot)
        if (set === undefined) signatures.set(slot, signature)
        else if (set !== signature) conflicts.set(slot, conflicts.get(slot) ?? [])
        add(from, slot, child.from.get(slot)!)
      }
    }
    for (const [slot, paths] of conflicts) {
      const setters = from.get(slot)
      if (setters === undefined) continue
      paths.push(...setters)
      from.delete(slot)
    }
    let head = folding.combine(
      node,
      children.map((child) => child.head),
      conflicts.size === 0 ? noConflicts : new Set(conflicts.keys())
    )
    const before = folding.slots(head)
    for (const slot of before.keys()) if (!from.has(slot)) from.set(slot, [path])
    if (reduce === undefined) return { head, slots: before, from, conflicts }
    try {
      head = reduce(head, values!)
    } catch (error) {
      if (node.onError === undefined) throw error
      node.onError(error)
    }
    const after = folding.slots(head)
    for (const [slot, signature] of after) {
      if (before.get(slot) === signature) continue
      from.set(slot, [path])
      conflicts.delete(slot)
    }
    for (const slot of from.keys()) if (!after.has(slot)) from.delete(slot)
    return { head, slots: after, from, conflicts }
  }
  const root = visit(tree)
  if (onConflict !== undefined) {
    for (const slot of [...root.conflicts.keys()].sort(compare)) {
      onConflict(slot, [...new Set(root.conflicts.get(slot))].sort(compare))
    }
  }
  return root.head
}
