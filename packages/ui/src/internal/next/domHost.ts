/**
 * The DOM host the kernel's test runtime mounts on in place of a browser host's bridge, which the kernel
 * test project's setup gives, as nothing outside `@effect/ui/html` may import it.
 *
 * Only the kernel test project calls it.
 *
 * @internal
 */
import type * as Renderer from "../../Renderer.ts"
import type * as hydrateRun from "../hydrateRun.ts"
import type * as Kernel from "../kernel.ts"

/** @internal */
export type Make = (
  host: Renderer.Host<any>,
  container: unknown,
  options: {
    readonly head: boolean
    readonly step: (f: () => boolean) => boolean
  }
) => (Kernel.Host & { readonly dispose: () => void }) | undefined

/** @internal */
export let make: Make | undefined

/** @internal */
export let adopt: hydrateRun.Adopt | undefined

/** @internal */
// oxlint-disable-next-line effect/no-unused-internal
export const set = (f: Make, adoptWith?: hydrateRun.Adopt): void => {
  make = f
  adopt = adoptWith
}
