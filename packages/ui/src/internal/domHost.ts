import type * as Renderer from "../Renderer.ts"
import type * as Kernel from "./kernel.ts"

interface Dom {
  readonly make: (
    container: unknown,
    options: {
      readonly head: boolean
      readonly step: (f: () => boolean) => boolean
    }
  ) => (Kernel.Host & { readonly dispose: () => void }) | undefined
}

/** @internal */
export const doms = new WeakMap<Renderer.Host<any>, Dom>()
