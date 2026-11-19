/**
 * A local copy of the `effect` internal that adds a finalizer to a scope
 * synchronously, keyed so that one owner can register at most one finalizer.
 * It writes `Scope.state` the way `effect` does.
 *
 * @internal
 */
import type * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"
import type * as Scope from "effect/Scope"

/** @internal */
export const scopeAddFinalizerUnsafe = (
  scope: Scope.Scope,
  key: {},
  finalizer: (exit: Exit.Exit<any, any>) => Effect.Effect<unknown>
): void => {
  if (scope.state._tag === "Empty") {
    scope.state = { _tag: "Open", finalizerKey: key, finalizer, finalizers: undefined }
  } else if (scope.state._tag === "Open") {
    const state = scope.state
    if (state.finalizer !== undefined) {
      state.finalizers = new Map([[state.finalizerKey!, state.finalizer]])
      state.finalizerKey = undefined
      state.finalizer = undefined
      state.finalizers.set(key, finalizer)
    } else {
      state.finalizers!.set(key, finalizer)
    }
  }
}

/**
 * Removes the finalizer `key` registered, as `effect` does when a forked
 * Scope closes before its parent.
 *
 * @internal
 */
export const scopeRemoveFinalizerUnsafe = (scope: Scope.Scope, key: {}): void => {
  if (scope.state._tag !== "Open") return
  const state = scope.state
  if (state.finalizerKey === key) {
    scope.state = { _tag: "Empty" }
  } else if (state.finalizers !== undefined) {
    state.finalizers.delete(key)
    if (state.finalizers.size === 0) scope.state = { _tag: "Empty" }
  }
}
