/**
 * @internal
 */
import type * as Renderer from "../Renderer.ts"
import type * as hydrateRun from "./hydrateRun.ts"
import type * as Kernel from "./kernel.ts"

/** @internal */
export interface Dom {
  readonly make: (
    container: unknown,
    options: {
      readonly head: boolean
      readonly step: (f: () => boolean) => boolean
    }
  ) => (Kernel.Host & { readonly dispose: () => void }) | undefined
  readonly adopt: hydrateRun.Adopt
}

/** @internal */
export const doms = new WeakMap<Renderer.Host<any>, Dom>()
