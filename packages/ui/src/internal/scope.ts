/**
 * A local copy of the `effect` internal that adds a finalizer to a scope
 * synchronously, keyed so that one owner can register at most one finalizer.
 * It writes `Scope.state` the way `effect` does.
 *
 * @internal
 */
import type * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"
import * as Scope from "effect/Scope"

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
 * Moves a Scope forked with `Scope.forkUnsafe` under another parent: the old one no longer closes it,
 * and the new one does, as if it had been forked there. Both must be open.
 *
 * @internal
 */
export const scopeMoveUnsafe = (scope: Scope.Closeable, to: Scope.Scope): void => {
  const from = scope.parent
  if (from === to) return
  if (from !== undefined && from.state._tag === "Open") {
    const state = from.state
    if (state.finalizerKey === scope) from.state = { _tag: "Empty" }
    else if (state.finalizers !== undefined) {
      state.finalizers.delete(scope)
      if (state.finalizers.size === 0) from.state = { _tag: "Empty" }
    }
  }
  ;(scope as { -readonly [K in "parent"]: Scope.Scope | undefined }).parent = to
  scopeAddFinalizerUnsafe(to, scope, (exit) => Scope.close(scope, exit))
}
