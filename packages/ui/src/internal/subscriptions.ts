/**
 * What the runtime and a test's engine both say about a `subscriptions`
 * result.
 *
 * @internal
 */
import type * as Subscription from "../Subscription.ts"
import type * as Kernel from "./kernel.ts"

/** @internal */
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

const encodeDep = (dep: Subscription.Dep): string =>
  typeof dep === "string"
    ? JSON.stringify(dep)
    : Object.is(dep, -0)
    ? "-0"
    : String(dep)

const encodeName = (name: string): string => name.replaceAll(":", "::")

/** @internal */
export const keyOf = (name: string, deps?: Subscription.Deps): string =>
  deps === undefined
    ? encodeName(name)
    : `${encodeName(name)}:${
      (Array.isArray(deps) ? deps : [deps as Subscription.Dep]).map(encodeDep)
        .join(",")
    }`
