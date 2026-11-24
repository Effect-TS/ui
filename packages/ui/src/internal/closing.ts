/**
 * What an instance's close waits for on the kernel, before the services it and its descendants use are
 * released: the fibers its runs, and its closed descendants' runs and releases, left going.
 *
 * @internal
 */
import type * as Fiber from "effect/Fiber"
import type * as Kernel from "./kernel.ts"

const holds = new WeakMap<
  Kernel.Instance,
  ReadonlyArray<Fiber.Fiber<unknown, unknown>>
>()

/** @internal */
export const going = (fiber: Fiber.Fiber<unknown, unknown>): boolean =>
  fiber.pollUnsafe() === undefined

/**
 * The fibers still going that `inst`'s close waits for.
 *
 * @internal
 */
export const heldBy = (
  inst: Kernel.Instance
): Array<Fiber.Fiber<unknown, unknown>> => (holds.get(inst) ?? []).filter(going)

/**
 * Makes the close of `inst` and of each of its ancestors wait for `fibers`.
 *
 * @internal
 */
export const hold = (
  inst: Kernel.Instance | undefined,
  fibers: ReadonlyArray<Fiber.Fiber<unknown, unknown>>
): void => {
  if (fibers.length === 0) return
  for (let at = inst; at !== undefined; at = at.parent) {
    holds.set(at, [...heldBy(at), ...fibers])
  }
}
