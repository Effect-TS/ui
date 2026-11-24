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
 * Forks `effect` on the Scheduler the mount's Executor gives, as a fiber the tree's close waits for. Unless
 * `now`, it never runs inside the step that started it.
 *
 * @internal
 */
export const fork = <A, E>(
  tree: Kernel.Tree,
  context: Context.Context<any>,
  effect: Effect.Effect<A, E, any>,
  now?: boolean
): Fiber.Fiber<A, E> =>
  owned(
    tree,
    Effect.runForkWith(withScheduler(context))(
      now ? effect : Effect.andThen(Effect.yieldNow, effect)
    )
  )

/**
 * `context` with the Scheduler the mount's Executor gives, if it gives one.
 *
 * @internal
 */
export const withScheduler = (
  context: Context.Context<any>
): Context.Context<any> => {
  const scheduler = Context.get(context, CurrentExecutor).scheduler
  return scheduler === undefined
    ? context
    : Context.add(context, Scheduler.Scheduler, scheduler)
}

/**
 * Makes the tree's close wait for `fiber`, until it exits.
 *
 * @internal
 */
export const owned = <A, E>(
  tree: Kernel.Tree,
  fiber: Fiber.Fiber<A, E>
): Fiber.Fiber<A, E> => {
  const owned = tree.owned ??= new Set()
  owned.add(fiber)
  fiber.addObserver(() => owned.delete(fiber))
  return fiber
}

/**
 * The services of `env`, or of the nearest Env above it that has them: what work runs against once a
 * provided Layer's failure was handled.
 *
 * @internal
 */
export const servicesOf = (
  env: Kernel.Env | undefined
): Context.Context<any> | undefined => {
  while (env !== undefined && env.ctx === undefined) env = env.parent
  return env?.ctx
}
