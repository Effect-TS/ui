/**
 * What Commands and Subscriptions share on the kernel: forking their fibers, which the tree's close waits
 * for, and running what a fiber brings back as what follows from the fact that started it.
 *
 * @internal
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as Fiber from "effect/Fiber"
import * as Scheduler from "effect/Scheduler"
import { CurrentExecutor } from "./executor.ts"
import type * as Kernel from "./kernel.ts"

const now = <A>(f: () => A): A => f()

/**
 * How to run something later as what follows from the fact running now: as it is, for a tree that
 * records no log.
 *
 * @internal
 */
export const follow = (tree: Kernel.Tree): <A>(f: () => A) => A =>
  tree.follow === undefined ? now : tree.follow()

/**
 * Forks `effect` on the Scheduler the mount's Executor gives, never inside the step that started it, as a
 * fiber the tree's close waits for.
 *
 * @internal
 */
export const fork = <A, E>(
  tree: Kernel.Tree,
  context: Context.Context<any>,
  effect: Effect.Effect<A, E, any>
): Fiber.Fiber<A, E> => {
  const scheduler = Context.get(context, CurrentExecutor).scheduler
  const fiber = Effect.runForkWith(
    scheduler === undefined
      ? context
      : Context.add(context, Scheduler.Scheduler, scheduler)
  )(Effect.andThen(Effect.yieldNow, effect))
  const owned = tree.owned ??= new Set()
  owned.add(fiber)
  fiber.addObserver(() => owned.delete(fiber))
  return fiber
}
