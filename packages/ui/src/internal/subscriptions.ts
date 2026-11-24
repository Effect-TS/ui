/**
 * What the runtime and a test's engine both say about a `subscriptions`
 * result.
 *
 * @internal
 */
import type * as Subscription from "../Subscription.ts"
import type * as Kernel from "./kernel.ts"

/**
 * What starts and stops an instance's Streams on the kernel, once `Subscription` is loaded: every value
 * a `subscriptions` result holds is made there, so before then there's nothing to run.
 *
 * @internal
 */
export let loaded: ((inst: Kernel.Instance) => void) | undefined

/** @internal */
export const load = (sync: (inst: Kernel.Instance) => void): void => {
  loaded = sync
}

/**
 * The error for the instance at `path` whose `subscriptions` returned two
 * entries with `key`. A key runs one Stream, so the second would never start.
 *
 * @internal
 */
export const duplicateKey = (path: string, key: string): Error =>
  new Error(
    `${path}: two Subscriptions share the key ${key}. A key runs one Stream, so give each its own name or deps.`
  )

// Strings are JSON, so they're quoted and self-delimiting. Everything else is
// its literal: `NaN`, `Infinity` and `-Infinity` stay distinct from `null`, and
// `-0` from `0`, since `1 / dep` tells them apart.
const encodeDep = (dep: Subscription.Dep): string =>
  typeof dep === "string"
    ? JSON.stringify(dep)
    : Object.is(dep, -0)
    ? "-0"
    : String(dep)

// A colon separates the name from the deps, so a colon in a name is doubled.
const encodeName = (name: string): string => name.replaceAll(":", "::")

/**
 * `Subscription.keyOf`, here so the runtime builds keys without importing `Subscription`, which loads
 * what runs Subscriptions on the kernel.
 *
 * @internal
 */
export const keyOf = (name: string, deps?: Subscription.Deps): string =>
  deps === undefined
    ? encodeName(name)
    : `${encodeName(name)}:${
      (Array.isArray(deps) ? deps : [deps as Subscription.Dep]).map(encodeDep)
        .join(",")
    }`
