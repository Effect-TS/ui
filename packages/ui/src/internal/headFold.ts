import type * as Head from "../Head.ts"

/** @internal */
export interface Folding<E, H> {
  readonly combine: (
    node: Head.Tree<E>,
    children: ReadonlyArray<H>,
    conflicted: ReadonlySet<string>
  ) => H
  /** The single slots a value holds, each with a signature of its value. */
  readonly slots: (head: H) => ReadonlyMap<string, string>
  readonly reducer: (entry: E) => ((below: H) => H) | undefined
}

interface Slot {
  readonly signature: string | undefined
  readonly paths: ReadonlyArray<string>
}

interface Merging {
  signature: string | undefined
  readonly paths: Array<string>
}

interface Folded<H> {
  readonly head: H
  readonly slots: ReadonlyMap<string, Slot>
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

/** @internal */
export const skipsEmpty = (merge: Function): boolean => plainMerges.has(merge)

const pathOf = (tree: Head.Tree<any>): string => tree.path ?? ""

const byPath = (a: Head.Tree<any>, b: Head.Tree<any>): number => {
  const x = pathOf(a)
  const y = pathOf(b)
  return x < y ? -1 : x > y ? 1 : 0
}

/** @internal */
export const fold = <E, H>(
  tree: Head.Tree<E>,
  folding: Folding<E, H>,
  onConflict: ((slot: string, paths: ReadonlyArray<string>) => void) | undefined
): H => {
  const nothing: Folded<H> = {
    head: folding.combine({ entries: [], children: [] }, [], new Set()),
    slots: new Map()
  }
  const visit = (node: Head.Tree<E>): Folded<H> => {
    const below = node.children.length > 1
      ? [...node.children].sort(byPath)
      : node.children
    const children: Array<Folded<H>> = []
    let last: string | undefined
    for (const child of below) {
      const folded = visit(child)
      if (folded === nothing) continue
      const path = pathOf(child)
      if (path === last) {
        throw new Error(
          `Head: two siblings ${
            path === "" ? "have no path" : `share the path ${path}`
          }, ` +
            "so their order is ambiguous. Give each sibling with head entries its own path"
        )
      }
      last = path
      children.push(folded)
    }
    if (node.entries.length === 0 && children.length < 2) {
      return children[0] ?? nothing
    }
    const slots = new Map<string, Merging>()
    const conflicted = new Set<string>()
    for (const child of children) {
      for (const [slot, set] of child.slots) {
        let merged = slots.get(slot)
        if (merged === undefined) {
          slots.set(
            slot,
            merged = { signature: set.signature, paths: [...set.paths] }
          )
        } else {
          if (merged.signature !== set.signature) merged.signature = undefined
          for (const path of set.paths) merged.paths.push(path)
        }
        if (merged.signature === undefined) conflicted.add(slot)
      }
    }
    const combined = folding.combine(
      node,
      children.map((child) => child.head),
      conflicted
    )
    const before = folding.slots(combined)
    let head = combined
    for (const entry of node.entries) {
      const reduce = folding.reducer(entry)
      if (reduce === undefined) continue
      try {
        head = reduce(head)
      } catch (error) {
        if (node.onError === undefined) throw error
        node.onError(error)
      }
    }
    const after = head === combined ? before : folding.slots(head)
    for (const [slot, set] of slots) {
      if (set.signature !== undefined && !after.has(slot)) slots.delete(slot)
    }
    const own = [pathOf(node)]
    for (const [slot, signature] of after) {
      const kept = before.get(slot) === signature
        ? slots.get(slot)?.paths
        : undefined
      slots.set(slot, { signature, paths: kept ?? own })
    }
    return { head, slots }
  }
  const root = visit(tree)
  if (onConflict !== undefined) {
    for (const slot of [...root.slots.keys()].sort()) {
      const set = root.slots.get(slot)!
      if (set.signature === undefined) {
        onConflict(slot, [...new Set(set.paths)].sort())
      }
    }
  }
  return root.head
}
