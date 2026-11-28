import type { ViewKind } from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"

/**
 * The kind of a surface's root node.
 *
 * @internal
 */
export const surface: ViewKind = { viewName: "" }

/**
 * The root of the tree the node is in: a surface's root while mounted.
 *
 * @internal
 */
export const rootOf = (n: NativeNode): NativeNode => {
  while (n.parent !== undefined) n = n.parent
  return n
}

/**
 * Whether the node is in a surface's tree, not removed or in a kept
 * container.
 *
 * @internal
 */
export const mounted = (n: NativeNode): boolean => rootOf(n).kind === surface

/**
 * Marks the node and the nodes around it for the next commit.
 *
 * @internal
 */
export const markDirty = (n: NativeNode | undefined) => {
  while (n !== undefined && !n.dirty) {
    n.dirty = true
    n = n.parent
    if (n !== undefined) n.kidsChanged = true
  }
}

/**
 * Matches the props whose values are colours.
 *
 * @internal
 */
export const isColor = /(^c|C)olor(Android)?$/
