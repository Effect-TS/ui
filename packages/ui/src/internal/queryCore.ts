/**
 * The part of `Query` every app carries: its host signals, its problems sink,
 * its key format and the cache's service key. The rest of the module is
 * reached through `loaded`, which `Query` sets when an app imports it, so an
 * app without queries doesn't bundle the cache.
 *
 * @internal
 */
import * as Context from "effect/Context"
import type * as Duration from "effect/Duration"
import type * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Query from "../Query.ts"
import type * as componentQueries from "./queries.ts"
import type * as queryRun from "./queryRun.ts"

// -----------------------------------------------------------------------------
// The loaded module
// -----------------------------------------------------------------------------

/** @internal */
export type Cache = ReturnType<typeof Query.internals>

/** @internal */
export interface CacheOptions {
  readonly visibility: Query.Signal
  readonly connectivity: Query.Signal
  readonly report: (problem: Query.Problem.Any) => void
  readonly idleMs?: number | undefined
  readonly idleTimeToLive?: Duration.Input | undefined
  /**
   * The server's per-request mode: an entry settles at most once and is never
   * stale after, every settle is stored, a query's own `invalidate` is ignored
   * and reported, and no idle timer, interval or host edge runs.
   */
  readonly settleOnce?: boolean | undefined
  /** `false`: no fetch ever starts, as on a server render with a budget of 0. */
  readonly fetches?: boolean | undefined
}

/**
 * What the runtime and `Component` call in `Query`, without importing it.
 *
 * @internal
 */
export interface Loaded extends
  Pick<
    typeof Query,
    | "defOf"
    | "internals"
    | "makeSnapshot"
    | "makeSnapshotMap"
    | "makeShipped"
    | "sameMore"
    | "snapshotData"
    | "snapshotMapData"
    | "snapshotMapSchema"
    | "snapshotSchema"
  >
{
  /** Builds a cache, with its disposal. The context supplies the `Clock` and the scheduler. */
  readonly buildCache: (
    context: Context.Context<never>,
    options: CacheOptions
  ) => { readonly cache: Cache; readonly dispose: Effect.Effect<void> }
  readonly bind: typeof componentQueries.bind
  readonly run: typeof queryRun
}

/**
 * `Query`'s functions, once an app has imported it. A query, a bound
 * `queries` record and a snapshot can only exist after that.
 *
 * @internal
 */
export let loaded: Loaded | undefined

/** @internal */
export const load = (module: Loaded | undefined): void => {
  loaded = module
}

// -----------------------------------------------------------------------------
// What a component and a watch carry
// -----------------------------------------------------------------------------

/**
 * A component's bound `queries`. `undefined` without any.
 *
 * @internal
 */
export const boundOf = (
  component: { readonly "~queries": unknown }
): componentQueries.Bound | undefined =>
  component["~queries"] as componentQueries.Bound | undefined

/** @internal */
export const markerKey = "~@effect/ui/Component/watchMarker"

/** @internal */
export const groupKey = "~@effect/ui/Component/watchGroup"

/** @internal */
export const markerOf = (
  subscription: object
): componentQueries.Marker | undefined =>
  (subscription as { readonly [markerKey]?: componentQueries.Marker })[
    markerKey
  ]

/** @internal */
export const groupOf = (
  subscription: object
): componentQueries.Group | undefined =>
  (subscription as { readonly [groupKey]?: componentQueries.Group })[groupKey]

/** @internal */
export const isWatchKey = (key: string): boolean => key.startsWith("~query/")

// -----------------------------------------------------------------------------
// The cache
// -----------------------------------------------------------------------------

/** @internal */
export const CacheTypeId = "~@effect/ui/Query/Cache"

/** @internal */
export const CacheCellTypeId = "~@effect/ui/Query/CacheCell"

/**
 * Stands in for a root's cache as the `Cache` service while `Query` isn't
 * loaded: `Query.internals` makes the cache from it.
 *
 * @internal
 */
export interface CacheCell {
  readonly [CacheTypeId]: typeof CacheTypeId
  readonly [CacheCellTypeId]: () => Cache
}

/**
 * The key of `Query.Cache`, to provide the service without importing `Query`.
 *
 * @internal
 */
export const CacheKey: Context.Key<Query.Cache, Query.Cache["Service"]> =
  Context.Service<
    Query.Cache,
    Query.Cache["Service"]
  >("@effect/ui/Query/Cache")

// -----------------------------------------------------------------------------
// Host signals
// -----------------------------------------------------------------------------

interface SettableSignal extends Query.Signal {
  readonly set: (value: boolean) => void
}

/** Adds a listener to a set. Returns its removal. */
export const addListener = <A>(listeners: Set<A>, listener: A): () => void => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

interface Subscriber {
  readonly listener: (value: boolean) => void
}

/**
 * A settable signal, for tests and for host Layers.
 *
 * @internal
 */
export const makeSignal = (initial = true): SettableSignal => {
  let current = initial
  const listeners = new Set<Subscriber>()
  // The changes being delivered, each with the listeners subscribed when it
  // was set. A `set` made by a listener waits here for the ones before it.
  let queue: Array<readonly [boolean, ReadonlyArray<Subscriber>]> | undefined
  return {
    get: () => current,
    subscribe: (listener) => addListener(listeners, { listener }),
    set: (value) => {
      if (value === current) return
      current = value
      const change = [value, Array.from(listeners)] as const
      if (queue !== undefined) return void queue.push(change)
      queue = [change]
      try {
        for (const [next, subscribed] of queue) {
          for (const sub of subscribed) {
            if (listeners.has(sub)) sub.listener(next)
          }
        }
      } finally {
        queue = undefined
      }
    }
  }
}

const alwaysTrue: Query.Signal = { get: () => true, subscribe: () => () => {} }

/** @internal */
export const Visibility: Context.Reference<Query.Signal> = Context.Reference<
  Query.Signal
>(
  "@effect/ui/Query/Visibility",
  { defaultValue: () => alwaysTrue }
)

/** @internal */
export const Connectivity: Context.Reference<Query.Signal> = Context.Reference<
  Query.Signal
>(
  "@effect/ui/Query/Connectivity",
  { defaultValue: () => alwaysTrue }
)

/** @internal */
export const Problems: Context.Reference<(problem: Query.Problem.Any) => void> =
  Context.Reference<
    (problem: Query.Problem.Any) => void
  >("@effect/ui/Query/Problems", {
    // oxlint-disable-next-line no-console
    defaultValue: () => (problem) => console.warn(problem.message)
  })

/**
 * Looks up a settled Success already shipped in `~query`, by query definition
 * and args key. Only provided when encoding or decoding page state so history,
 * the message log and standalone codecs stay self-contained.
 *
 * @internal
 */
export interface ShippedContext {
  readonly peek: (
    def: any,
    argsKey: string
  ) => AsyncResult.Success<any, any> | undefined
  readonly decode: (
    def: any,
    argsKey: string
  ) => Effect.Effect<AsyncResult.Success<any, any>, any>
}

/**
 * Per-hydration state over `state["~query"]`, shared between that hydration's
 * instance decoders, its cache's `decodeRaw`, and held-child history handoffs.
 *
 * @internal
 */
export interface ShippedHydration {
  readonly lookup: ShippedContext
  readonly decodeRaw: (def: any, tuple: any) => unknown
  readonly inline: (component: unknown, encoded: unknown) => unknown
  readonly cancelPending: (all: boolean) => void
}

/** @internal */
export const Shipped: Context.Reference<ShippedContext | undefined> = Context
  .Reference<ShippedContext | undefined>("@effect/ui/Query/Shipped", {
    defaultValue: () => undefined
  })

/**
 * Where a cache restores and saves the Successes of `persist` queries.
 * `undefined` by default: nothing is restored or saved. `QueryPersistence`
 * provides it.
 *
 * @internal
 */
export interface Persistence {
  /** The saved Success a new entry starts from, decoded. */
  readonly get: (
    def: ReturnType<typeof Query.defOf>,
    argsKey: string
  ) => AsyncResult.Success<any, any> | undefined
  /**
   * Called with every result the cache stores. `report` is that cache's
   * problems sink, which this Layer's own context may not hold.
   */
  readonly save: (
    def: ReturnType<typeof Query.defOf>,
    argsKey: string,
    result: AsyncResult.AsyncResult<any, any>,
    report: (problem: Query.Problem.Any) => void
  ) => void
}

/** @internal */
export const Persistence: Context.Reference<Persistence | undefined> = Context
  .Reference<Persistence | undefined>("@effect/ui/Query/Persistence", {
    defaultValue: () => undefined
  })

/**
 * `Equal.equals`, except that two Failures also compare their previous
 * Success, which AsyncResult's own equality ignores.
 *
 * @internal
 */
export const sameResult = (a: unknown, b: unknown): boolean =>
  Equal.equals(a, b) &&
  !(AsyncResult.isAsyncResult(a) && a._tag === "Failure" &&
    !Equal.equals(
      a.previousSuccess,
      (b as AsyncResult.Failure<unknown, unknown>).previousSuccess
    ))

/** @internal */
export const report = (
  ctx: Context.Context<never>,
  problem: unknown
): void => {
  try {
    Context.get(ctx, Problems)(problem as never)
  } catch {
  }
}

// -----------------------------------------------------------------------------
// Keys
// -----------------------------------------------------------------------------

// A fixed name for the kind of a leaf. Never its value, nor anything the value can set, such as its string tag: a
// key can hold a secret.
const kindOf = (leaf: unknown): string => {
  switch (typeof leaf) {
    case "number":
      return "a non-finite number"
    case "undefined":
      return "undefined"
    case "object":
      return "a class instance"
    default:
      return "a " + typeof leaf
  }
}

/** @internal */
export class NonJsonLeaf {
  readonly kind: string
  constructor(leaf: unknown) {
    this.kind = kindOf(leaf)
  }
}

/**
 * Canonical JSON: sorted object keys, `undefined` properties dropped, no
 * whitespace, `-0` kept apart from `0`. It parses back with `JSON.parse`.
 * Throws a `NonJsonLeaf` on a leaf JSON can't carry.
 *
 * @internal
 */
export const canonical = (u: unknown): string => {
  if (u === null || typeof u === "boolean") return String(u)
  if (typeof u === "string") return JSON.stringify(u)
  if (typeof u === "number") {
    if (!Number.isFinite(u)) throw new NonJsonLeaf(u)
    return Object.is(u, -0) ? "-0" : String(u)
  }
  if (Array.isArray(u)) {
    const parts: Array<string> = []
    // Not `map`: a hole must throw too.
    for (let i = 0; i < u.length; i++) parts.push(canonical(u[i]))
    return "[" + parts.join(",") + "]"
  }
  if (typeof u === "object") {
    const proto = Object.getPrototypeOf(u)
    if (proto !== Object.prototype && proto !== null) throw new NonJsonLeaf(u)
    const o = u as Record<string, unknown>
    const parts: Array<string> = []
    for (const key of Object.keys(o).sort()) {
      if (o[key] !== undefined) {
        parts.push(JSON.stringify(key) + ":" + canonical(o[key]))
      }
    }
    return "{" + parts.join(",") + "}"
  }
  throw new NonJsonLeaf(u)
}
