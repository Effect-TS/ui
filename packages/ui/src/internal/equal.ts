/**
 * The equality props, shared values and reports change by: shallow for plain records, `Equal.equals`
 * otherwise.
 *
 * @internal
 */
import * as Equal from "effect/Equal"

/**
 * Shallow per key for plain records, `Equal.equals` otherwise (and for fields
 * that differ by reference).
 *
 * @internal
 */
export const propsEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (!isPlainRecord(a) || !isPlainRecord(b)) return Equal.equals(a, b)
  let count = 0
  for (const key in a) {
    if (!Object.hasOwn(a, key)) continue
    if (!Object.hasOwn(b, key)) return false
    const x = (a as any)[key]
    const y = (b as any)[key]
    if (x !== y && (differsPlainly(x, y) || !Equal.equals(x, y))) return false
    count++
  }
  for (const key in b) {
    if (Object.hasOwn(b, key)) count--
  }
  return count === 0
}

const isPrimitive = (u: unknown): boolean =>
  u === null || (typeof u !== "object" && typeof u !== "function")

/** An object literal, or one with no prototype. */
const isPlainRecord = (value: unknown): value is object => {
  if (typeof value !== "object" || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Whether two plain objects have a field that differs as a primitive, so they can't be equal. It
 * answers for the common change, a record with one field replaced, without the hashes `Equal.equals`
 * takes of both. `false` leaves the answer to `Equal.equals`.
 */
const differsPlainly = (a: unknown, b: unknown): boolean => {
  if (
    typeof a !== "object" || typeof b !== "object" || a === null || b === null
  ) return false
  if (
    Object.getPrototypeOf(a) !== Object.prototype ||
    Object.getPrototypeOf(b) !== Object.prototype
  ) return false
  // An object with its own equality decides for itself.
  if (Equal.symbol in a || Equal.symbol in b) return false
  for (const key in a) {
    if (!Object.hasOwn(b, key)) continue
    const x = (a as any)[key]
    const y = (b as any)[key]
    // `NaN` is equal to itself for `Equal.equals`.
    if (x !== y && isPrimitive(x) && isPrimitive(y) && (x === x || y === y)) {
      return true
    }
  }
  return false
}

/**
 * A shared value, or what an owner's `collects.onChange` returns: compared by
 * the same rules as props.
 *
 * @internal
 */
export const sharedEqual: (a: unknown, b: unknown) => boolean = propsEqual
