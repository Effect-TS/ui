/**
 * The equality props, shared values and reports change by: structural for plain records and arrays,
 * `Equal.equals` otherwise.
 *
 * @internal
 */
import * as Equal from "effect/Equal"

// Pairs on the active comparison path, for coinductive cycle detection matching `Equal.equals`.
const pathLeft: Array<object> = []
const pathRight: Array<object> = []

const isPlainObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const sameObject = (a: object, b: object): boolean => {
  if (Equal.symbol in a || Equal.symbol in b) return Equal.equals(a, b)
  const isArray = Array.isArray(a)
  if (isArray !== Array.isArray(b)) return false
  if (isArray) {
    if ((a as Array<unknown>).length !== (b as Array<unknown>).length) {
      return false
    }
  } else if (!isPlainObject(a) || !isPlainObject(b)) {
    return Equal.equals(a, b)
  }
  const depth = pathLeft.length
  for (let i = depth; i-- > 0;) {
    if (pathLeft[i] === a && pathRight[i] === b) return true
  }
  let pushed = false
  try {
    if (isArray) {
      for (let i = 0; i < (a as Array<unknown>).length; i++) {
        const x = (a as Array<unknown>)[i]
        const y = (b as Array<unknown>)[i]
        if (x === y) continue
        if (!pushed) {
          pushed = true
          pathLeft.push(a)
          pathRight.push(b)
        }
        if (!propsEqual(x, y)) return false
      }
      return true
    }
    let count = 0
    for (const key in a) {
      if (!Object.hasOwn(a, key)) continue
      if (!Object.hasOwn(b, key)) return false
      const x = (a as Record<string, unknown>)[key]
      const y = (b as Record<string, unknown>)[key]
      if (x !== y) {
        if (!pushed) {
          pushed = true
          pathLeft.push(a)
          pathRight.push(b)
        }
        if (!propsEqual(x, y)) return false
      }
      count++
    }
    for (const key in b) {
      if (Object.hasOwn(b, key)) count--
    }
    return count === 0
  } finally {
    if (pushed) pathLeft.length = pathRight.length = depth
  }
}

/**
 * Structural equality for plain records and arrays, with `Equal.equals` for custom `Equal` values
 * and non-plain objects.
 *
 * @internal
 */
export const propsEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (
    typeof a !== "object" || typeof b !== "object" || a === null || b === null
  ) {
    return (a !== a && b !== b) || (
      typeof a === "function" && typeof b === "function" &&
      Equal.symbol in a && Equal.symbol in b && Equal.equals(a, b)
    )
  }
  return sameObject(a, b)
}

/**
 * A shared value, or what an owner's `collects.onChange` returns: structural for plain records and
 * arrays, and `Equal.equals` otherwise.
 *
 * @internal
 */
export const sharedEqual: (a: unknown, b: unknown) => boolean = propsEqual
