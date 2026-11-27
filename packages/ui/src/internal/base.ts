/**
 * A union's base, set for the life of a Layer.
 *
 * @internal
 */
import * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import type * as Route from "../Route.ts"

/**
 * The `setBase` functions `Route.union` creates. Each is shared by a union,
 * its subsets and its copies, so it identifies their base.
 *
 * @internal
 */
export const setters = new WeakSet<Function>()

/** The base from before the first open scope, then one per open scope. */
const stacks = new WeakMap<object, Array<{ readonly base: string }>>()

/**
 * Sets the base of `routes` until the Scope closes. Scopes can close in any
 * order, as when a dev server reloads its entry, and the newest open one's
 * base stays.
 *
 * @internal
 */
export const scoped = (
  routes: Route.AnyUnion,
  base: string
): Effect.Effect<unknown, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      // Any other `setBase` may be shared by unions that don't share a base.
      const key = setters.has(routes.setBase) ? routes.setBase : routes
      let stack = stacks.get(key)
      if (stack === undefined) {
        stacks.set(key, stack = [{ base: routes.base() }])
      }
      const entry = { base }
      stack.push(entry)
      routes.setBase(base)
      return () => {
        stack.splice(stack.indexOf(entry), 1)
        routes.setBase(stack.at(-1)!.base)
        if (stack.length === 1) stacks.delete(key)
      }
    }),
    (restore) => Effect.sync(restore)
  )
