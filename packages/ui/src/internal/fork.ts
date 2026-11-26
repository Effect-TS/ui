import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as Fiber from "effect/Fiber"
import * as Scheduler from "effect/Scheduler"
import { CurrentExecutor } from "./executor.ts"
import type * as Kernel from "./kernel.ts"

/** @internal */
export const now = <A>(f: () => A): A => f()

/**
 * Above 0 while `inlined` runs: fibers then yield only after
 * `maxOpsBeforeYield` steps.
 *
 * @internal
 */
export let inline = 0

/**
 * Runs `f` so that the fiber work it starts runs in this task, up to its
 * first async step.
 *
 * @internal
 */
export const inlined = <A>(f: () => A): A => {
  inline++
  try {
    return f()
  } finally {
    inline--
  }
}

/** @internal */
export const follow = (
  tree: Kernel.Tree,
  late?: boolean
): <A>(f: () => A) => A => tree.follow === undefined ? now : tree.follow(late)

/** @internal */
export const fork = <A, E>(
  tree: Kernel.Tree,
  context: Context.Context<any>,
  effect: Effect.Effect<A, E, any>,
  now?: boolean
): Fiber.Fiber<A, E> => {
  const run = Effect.runForkWith(withScheduler(context))
  return owned(
    tree,
    now
      ? inlined(() => run(effect))
      : run(Effect.andThen(Effect.yieldNow, effect))
  )
}

/** @internal */
export const withScheduler = (
  context: Context.Context<any>
): Context.Context<any> => {
  const scheduler = Context.get(context, CurrentExecutor).scheduler
  return scheduler === undefined
    ? context
    : Context.add(context, Scheduler.Scheduler, scheduler)
}

/** @internal */
export const owned = <A, E>(
  tree: Kernel.Tree,
  fiber: Fiber.Fiber<A, E>
): Fiber.Fiber<A, E> => {
  const owned = tree.owned ??= new Set()
  owned.add(fiber)
  fiber.addObserver(() => owned.delete(fiber))
  return fiber
}

/** @internal */
export const servicesOf = (env: Kernel.Env): Context.Context<any> => {
  while (env.ctx === undefined) env = env.parent!
  return env.ctx
}
