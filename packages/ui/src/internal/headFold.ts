/**
 * The fold behind every vocabulary's head merge: children first, then the node's own entries and its
 * children's values, then the node's `reduce`. It tracks which path set each single slot, so a slot
 * two siblings set is reported, and the later sibling keeps it.
 */
import type * as Head from "../Head.ts"

/** @internal */
export interface Folding<E, H> {
  /** The node's value before its `reduce`: its own entries, then its children's values in order. */
  readonly combine: (node: Head.Tree<E, H>, children: ReadonlyArray<H>) => H
  /** The single slots a value holds, each with a signature of its value. */
  readonly slots: (head: H) => ReadonlyMap<string, string>
}

interface Folded<H> {
  readonly head: H
  /** Which path set each single slot of `head`. */
  readonly from: Map<string, string>
}

// The merges that are this fold and nothing more: see `skipsEmpty`.
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

/** @internal */
export const fold = <E, H>(
  tree: Head.Tree<E, H>,
  folding: Folding<E, H>,
  onConflict: ((slot: string, earlier: string, later: string) => void) | undefined
): H => {
  // What a node with no entries and nothing below it folds to.
  const nothing: Folded<H> = { head: folding.combine({ entries: [], children: [] }, []), from: new Map() }
  const visit = (node: Head.Tree<E, H>): Folded<H> => {
    const children: Array<Folded<H>> = []
    for (const child of node.children) {
      const folded = visit(child)
      if (folded !== nothing) children.push(folded)
    }
    // Most nodes have nothing of their own: such a node passes its only child's value up as it is.
    if (node.entries.length === 0 && node.reduce === undefined && children.length < 2) return children[0] ?? nothing
    const path = node.path ?? ""
    const from = new Map<string, string>()
    // Two children setting one slot is a conflict.
    for (const child of children) {
      for (const [slot, at] of child.from) {
        const earlier = from.get(slot)
        if (earlier !== undefined && onConflict !== undefined) onConflict(slot, earlier, at)
        from.set(slot, at)
      }
    }
    let head = folding.combine(node, children.map((child) => child.head))
    const before = folding.slots(head)
    // A slot no child set is the node's own: a descendant overrides its ancestor's.
    for (const slot of before.keys()) if (!from.has(slot)) from.set(slot, path)
    if (node.reduce !== undefined) {
      try {
        head = node.reduce(head)
      } catch (error) {
        if (node.onError === undefined) throw error
        node.onError(error)
      }
      const after = folding.slots(head)
      // What the reduce changed is the reducing node's.
      for (const [slot, signature] of after) if (before.get(slot) !== signature) from.set(slot, path)
      for (const slot of from.keys()) if (!after.has(slot)) from.delete(slot)
    }
    return { head, from }
  }
  return visit(tree).head
}
