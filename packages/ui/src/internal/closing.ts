import type * as Fiber from "effect/Fiber"
import type * as Kernel from "./kernel.ts"

const holds = new WeakMap<
  Kernel.Instance,
  ReadonlyArray<Fiber.Fiber<unknown, unknown>>
>()

/** @internal */
export const going = (fiber: Fiber.Fiber<unknown, unknown>): boolean =>
  fiber.pollUnsafe() === undefined

/** @internal */
export const heldBy = (
  inst: Kernel.Instance
): Array<Fiber.Fiber<unknown, unknown>> => (holds.get(inst) ?? []).filter(going)

/** @internal */
export const hold = (
  inst: Kernel.Instance | undefined,
  fibers: ReadonlyArray<Fiber.Fiber<unknown, unknown>>
): void => {
  if (fibers.length === 0) return
  for (let at = inst; at !== undefined; at = at.parent) {
    holds.set(at, [...heldBy(at), ...fibers])
  }
}
