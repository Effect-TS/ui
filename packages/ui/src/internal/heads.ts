/**
 * What folds the head of a tree on the kernel, once `Head` is loaded: every head entry is made there, so
 * before then there's nothing to fold.
 *
 * @internal
 */
import type * as Kernel from "./kernel.ts"

/** @internal */
export let loaded: ((inst: Kernel.Instance) => void) | undefined

/** @internal */
export const load = (start: (inst: Kernel.Instance) => void): void => {
  loaded = start
}
