/**
 * Local copies of the `effect` internals that add a finalizer to a scope
 * synchronously, keyed so that one owner can register at most one finalizer,
 * and remove it by its key. They write `Scope.state` the way `effect` does.
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

const scopeRemoveFinalizerUnsafe = (scope: Scope.Scope, key: {}): void => {
  if (scope.state._tag !== "Open") return
  const state = scope.state
  if (state.finalizerKey === key) {
    scope.state = { _tag: "Empty" }
  } else if (state.finalizers !== undefined) {
    state.finalizers.delete(key)
    if (state.finalizers.size === 0) scope.state = { _tag: "Empty" }
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
  if (from !== undefined) scopeRemoveFinalizerUnsafe(from, scope)
  ;(scope as { -readonly [K in "parent"]: Scope.Scope | undefined }).parent = to
  scopeAddFinalizerUnsafe(to, scope, (exit) => Scope.close(scope, exit))
}
