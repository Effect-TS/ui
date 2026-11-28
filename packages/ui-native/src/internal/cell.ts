/**
 * A value and the listeners told when it changes.
 *
 * @internal
 */
export interface Cell<A> {
  readonly get: () => A
  /** Skips a value `equals` the current one. */
  readonly set: (value: A) => void
  readonly subscribe: (listener: (value: A) => void) => () => void
}

/** @internal */
export const cell = <A>(
  initial: A,
  equals: (a: A, b: A) => boolean = Object.is
): Cell<A> => {
  const listeners = new Set<(value: A) => void>()
  let current = initial
  return {
    get: () => current,
    set(value) {
      if (equals(current, value)) return
      current = value
      for (const listener of listeners) listener(value)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
