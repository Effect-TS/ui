import type * as Kernel from "./kernel.ts"

/** @internal */
export let loaded: ((inst: Kernel.Instance) => void) | undefined

/** @internal */
export const load = (start: (inst: Kernel.Instance) => void): void => {
  loaded = start
}
