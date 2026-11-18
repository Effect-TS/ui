/**
 * The entries of a reader's `shared` option, normalized: an owner alone is
 * short for `{ owner }`.
 *
 * @internal
 */
import type * as Component from "../Component.ts"

/** @internal */
export interface Read {
  /** The local name `h.shared` and `p.shared` read the owner under. */
  readonly name: string
  readonly owner: Component.Headless.Any
  readonly optional: boolean
  readonly report: ((model: unknown, props: unknown) => unknown) | undefined
  readonly onChange: ((value: unknown) => unknown) | undefined
}

const none: ReadonlyArray<Read> = []
const cache = new WeakMap<object, ReadonlyArray<Read>>()

/** A definition's `shared` entries, in order. @internal */
export const readsOf = (definition: Component.Definition.Any): ReadonlyArray<Read> => {
  const shared = definition.shared
  if (shared === undefined) return none
  let reads = cache.get(shared)
  if (reads === undefined) {
    reads = Object.entries(shared).map(([name, entry]): Read =>
      // A component is a function, and the long form a plain object.
      typeof entry === "function"
        ? { name, owner: entry, optional: false, report: undefined, onChange: undefined }
        : {
          name,
          owner: entry.owner,
          optional: entry.optional === true,
          report: entry.report as Read["report"],
          onChange: entry.onChange as Read["onChange"]
        }
    )
    cache.set(shared, reads)
  }
  return reads
}
