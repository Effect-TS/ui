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
  /** The single slots a node's own entries set. */
  readonly ownSlots: (entries: ReadonlyArray<E>) => Iterable<string>
}

interface Folded<H> {
  readonly head: H
  /** Which path set each single slot of `head`. */
  readonly from: Map<string, string>
}

/** @internal */
export const fold = <E, H>(
  tree: Head.Tree<E, H>,
  folding: Folding<E, H>,
  onConflict: ((slot: string, earlier: string, later: string) => void) | undefined
): H => {
  const visit = (node: Head.Tree<E, H>): Folded<H> => {
    const children = node.children.map(visit)
    const path = node.path ?? ""
    const from = new Map<string, string>()
    for (const slot of folding.ownSlots(node.entries)) from.set(slot, path)
    // A descendant overrides its ancestor's slot. Two children setting one is a conflict.
    const byChild = new Map<string, string>()
    for (const child of children) {
      for (const [slot, at] of child.from) {
        const earlier = byChild.get(slot)
        if (earlier !== undefined && onConflict !== undefined) onConflict(slot, earlier, at)
        byChild.set(slot, at)
        from.set(slot, at)
      }
    }
    let head = folding.combine(node, children.map((child) => child.head))
    if (node.reduce !== undefined) {
      const before = folding.slots(head)
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
