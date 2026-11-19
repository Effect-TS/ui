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
// Each definition's component, for the entries of `shared` that name it as `"self"`.
const selves = new WeakMap<Component.Definition.Any, Component.Headless.Any>()

/** Records the component `make` built from `definition`, which its `"self"` entries read. @internal */
export const bindSelf = (definition: Component.Definition.Any, component: Component.Any): void => {
  selves.set(definition, component as unknown as Component.Headless.Any)
}

const selfOf = (definition: Component.Definition.Any): Component.Headless.Any => {
  const self = selves.get(definition)
  if (self === undefined) throw new Error(`${definition.name} reads its own kind in shared before make finished it`)
  return self
}

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
          owner: entry.owner === "self" ? selfOf(definition) : entry.owner,
          optional: entry.optional === true,
          report: entry.report as Read["report"],
          onChange: entry.onChange as Read["onChange"]
        }
    )
    cache.set(shared, reads)
  }
  return reads
}

/**
 * Throws for a `shared` option that gives one owner two `onChange`s: a reader gets one message per
 * round of an owner. Aliases of an owner with one `onChange` among them are fine. Throws too for an
 * entry for `"self"` that isn't optional, or in a component that shares nothing.
 *
 * @internal
 */
export const check = (name: string, shared: Component.SharedReads, shares: boolean): void => {
  const handled = new Map<unknown, string>()
  for (const [key, entry] of Object.entries(shared)) {
    if (typeof entry === "function") continue
    if (entry.owner === "self") {
      if (!shares) throw new Error(`${name} reads its own kind under ${key}, so it must share state: add shares`)
      if (entry.optional !== true) {
        throw new Error(
          `${name} reads its own kind under ${key}, and the outermost one has none above it: add optional: true`
        )
      }
    }
    if (entry.onChange === undefined) continue
    const owner = entry.owner === "self" ? "self" : entry.owner.definition
    const before = handled.get(owner)
    if (before !== undefined) {
      const owned = owner === "self" ? name : (owner as Component.Definition.Any).name
      throw new Error(
        `${name} lists ${owned} under ${before} and ${key}, each with an onChange. A reader gets one message per change of an owner: keep one onChange.`
      )
    }
    handled.set(owner, key)
  }
}
