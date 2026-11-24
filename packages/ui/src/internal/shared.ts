/**
 * The entries of a reader's `reads` option, normalized: an owner alone is
 * short for `{ owner }`.
 *
 * @internal
 */
import type * as Component from "../Component.ts"

/** @internal */
export interface Read {
  /** The local name `h.reads`, `p.reads` and `$.reads` read the owner under. */
  readonly name: string
  readonly owner: Component.Headless.Any
  readonly optional: boolean
  readonly report:
    | ((
      model: unknown,
      props: unknown,
      id: Component.PartsHelper<never, unknown, any>["id"]
    ) => unknown)
    | undefined
  readonly onChange: ((value: unknown) => unknown) | undefined
}

const none: ReadonlyArray<Read> = []
const cache = new WeakMap<object, ReadonlyArray<Read>>()

/**
 * A definition's `reads` entries, in order. `self` is the component `make` built from it, which an
 * entry for `"self"` names: `make` reads them first, and every later read is of the ones it kept.
 *
 * @internal
 */
export const readsOf = (
  definition: Component.Definition.Any,
  self?: Component.Any
): ReadonlyArray<Read> => {
  const declared = definition.reads
  if (declared === undefined) return none
  let reads = cache.get(declared)
  if (reads === undefined) {
    reads = Object.entries(declared).map(([name, entry]): Read =>
      // A component is a function, and the long form a plain object.
      typeof entry === "function"
        ? {
          name,
          owner: entry,
          optional: false,
          report: undefined,
          onChange: undefined
        }
        : {
          name,
          owner: entry.owner === "self"
            ? self as unknown as Component.Headless.Any
            : entry.owner,
          optional: entry.optional === true,
          report: entry.report as Read["report"],
          onChange: entry.onChange as Read["onChange"]
        }
    )
    cache.set(declared, reads)
  }
  return reads
}

const missing = (name: string, read: Read): never => {
  throw new Error(
    `${name} reads the shared state of ${read.owner.definition.name}, and nothing supplies it: render it below a ${read.owner.definition.name}`
  )
}

/** @internal */
export const values = (
  name: string,
  reads: ReadonlyArray<Read>,
  lookup: Component.SharedLookup | undefined
): Component.SharedRecord => {
  const out: { [name: string]: unknown } = {}
  for (const read of reads) {
    out[read.name] = lookup !== undefined
      ? lookup(read.owner, read.optional)
      : read.optional
      ? undefined
      : missing(name, read)
  }
  return out
}

/** @internal */
export const record = (
  component: Component.Any,
  lookup: Component.SharedLookup | undefined
): Component.SharedRecord | undefined => {
  const reads = readsOf(component.definition)
  return reads.length === 0
    ? undefined
    : values(component.definition.name, reads, lookup)
}

/** @internal */
export const unsupplied = (
  name: string,
  reads: ReadonlyArray<Read>
): Component.SharedRecord => {
  const out: { [name: string]: unknown } = {}
  for (const read of reads) {
    if (read.optional) out[read.name] = undefined
    else {Object.defineProperty(out, read.name, {
        enumerable: true,
        get: () => missing(name, read)
      })}
  }
  return Object.freeze(out)
}

/**
 * Throws for a definition whose `reads` gives one owner two `onChange`s: a reader gets one message per
 * round of an owner. Aliases of an owner with one `onChange` among them are fine. Throws too for an
 * entry for `"self"` that isn't optional, or in a component that shares nothing.
 *
 * @internal
 */
export const check = (definition: Component.Definition.Any): void => {
  const { name, reads: declared } = definition
  if (declared === undefined) return
  const handled = new Map<Component.Definition.Any, string>()
  for (const [key, entry] of Object.entries(declared)) {
    if (typeof entry === "function") continue
    if (entry.owner === "self") {
      if (definition.shares === undefined) {
        throw new Error(
          `${name} reads its own kind under ${key}, so it must share state: add shares`
        )
      }
      if (entry.optional !== true) {
        throw new Error(
          `${name} reads its own kind under ${key}, and the outermost one has none above it: add optional: true`
        )
      }
    }
    if (entry.onChange === undefined) continue
    const owner = entry.owner === "self" ? definition : entry.owner.definition
    const before = handled.get(owner)
    if (before !== undefined) {
      throw new Error(
        `${name} lists ${owner.name} under ${before} and ${key}, each with an onChange. A reader gets one message per change of an owner: keep one onChange.`
      )
    }
    handled.set(owner, key)
  }
}
