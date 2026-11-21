/**
 * Service keys shared by the public modules and the runtime.
 *
 * @internal
 */
import type * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type { Refs as RefsShape, Renderer as RendererShape } from "../Renderer.ts"
import type * as Route from "../Route.ts"
import type * as Subscription from "../Subscription.ts"
import type * as prefetchWalk from "./prefetch.ts"

/** @internal */
export const Renderer = Context.Service<RendererShape, RendererShape>("@effect/ui/Renderer")

/** @internal */
export const Refs = Context.Service<RefsShape, RefsShape>("@effect/ui/Renderer/Refs")

/**
 * What a mounted root offers the router: its flush counter and its instances' state.
 *
 * @internal
 */
export interface RootHandle {
  /** Whether the root actually adopted a server Model, including after a deferred Layer resolves. */
  readonly hydrated: boolean
  /** Whether the root's server state came from a `static: true` render: it carries `~static`. */
  readonly static: boolean
  readonly container: unknown
  /** The current flush: 0 for the first render, then one more per flush. */
  readonly flush: () => number
  /** Whether a flush is running, so what it delivers now renders in `flush()` and not the next one. */
  readonly flushing: () => boolean
  /**
   * Writes the JSON-encoded Model of every mounted instance into `out`, by path. One that encodes
   * asynchronously is written once encoded, after this returns. Models that don't encode are left out.
   */
  readonly snapshot: (out: Record<string, unknown>) => void
  /**
   * The Router navigated. It closes the cache's fetch-free window after hydration, if adoption
   * hasn't yet. The Router calls it first in `set`, before the route changes.
   */
  readonly navigated: () => void
  readonly restored: () => void
  /** The runtime's problems sink. */
  readonly report: (problem: { readonly _tag: string; readonly message: string }) => void
}

/**
 * What the runtime tells the router after each flush.
 *
 * @internal
 */
export interface FlushInfo {
  readonly flush: number
  /** The title of the head this flush folded, whether or not the host applies it. */
  readonly title: string | undefined
  /** Provided Layer builds that began in `flush` or later and are still pending, tree-wide. */
  readonly buildsPendingSince: (flush: number) => number
}

/**
 * The router's side of the runtime: one post-flush hook, called after the
 * nodes commit and head sync, and the history restore of a new instance's
 * Model. Router Layers provide it; without one the runtime skips both.
 *
 * @internal
 */
export interface RootHooks {
  /** Registers a mounted root. The returned function unregisters it. */
  readonly attach: (root: RootHandle) => () => void
  readonly afterFlush: (root: RootHandle, info: FlushInfo) => void
  /** The encoded Model a new instance at `path` adopts, if the router is restoring one. */
  readonly restore: (path: string) => unknown
  /**
   * Registers an instance's `Router.prefetch` declaration. The returned function unregisters it. The
   * Router makes the declarer, with its own walk and check, from what the runtime gives. `declared`
   * holds the latest `subscriptions` run's map.
   */
  readonly prefetch: (
    runtime: prefetchWalk.Runtime,
    inst: prefetchWalk.Instance,
    declared: { readonly declaration: Prefetch }
  ) => () => void
}

/**
 * A mounted instance's `Router.prefetch` declaration, as the router sees it.
 *
 * @internal
 */
export interface Declarer {
  /** The union the declaration's map covers. It follows the latest `subscriptions` run. */
  readonly routes: () => Route.AnyUnion
  /**
   * Runs the declaration for `route` synchronously. An intent is dropped when
   * the declaration ran for the same printed route less than 30 seconds ago.
   * A navigation returns the check to run once it settles.
   */
  readonly run: (route: { readonly _tag: string }, intent: boolean) => PrefetchCheck | undefined
}

/**
 * The check after a navigation that ran a declaration. The Router calls
 * exactly one of the two: `settled` when the navigation settles, `dropped`
 * when another navigation supersedes it or the Router closes. Either ends the
 * watch recording the check holds open.
 *
 * @internal
 */
export interface PrefetchCheck {
  readonly settled: () => void
  readonly dropped: () => void
}

/**
 * A `Router.prefetch` Subscription carries its declaration under this key.
 * The runtime reads it at every `subscriptions` run and runs no Stream for it.
 *
 * @internal
 */
export const prefetch: unique symbol = Symbol.for("@effect/ui/Router/prefetch") as any

/** @internal */
export interface Prefetch {
  readonly routes: Route.AnyUnion
  readonly map: Readonly<Record<string, (route: any) => ReadonlyArray<Page>>>
}

/**
 * One page a declaration names: a component and its props.
 *
 * @internal
 */
export interface Page {
  readonly component: unknown
  readonly props: unknown
}

/** @internal */
export const RootHooks = Context.Service<RootHooks, RootHooks>("@effect/ui/internal/RootHooks")

/**
 * What a server render writes its frozen tree to, in document order: an
 * element's content between its `open` and `close`, and an instance's, or a
 * child's `fallback`, between `enter` and `leave` of its path. A child that
 * is written as its one element gets neither.
 *
 * @internal
 */
export interface ServerSink {
  readonly text: (text: string) => void
  readonly open: (
    tag: string,
    attrs: Readonly<Record<string, string>>,
    props: Readonly<Record<string, unknown>>
  ) => void
  readonly close: (tag: string) => void
  readonly enter: (path: string) => void
  readonly leave: (path: string) => void
}

/** @internal */
export const CurrentRoot = Context.Reference<() => RootHandle | undefined>("@effect/ui/internal/CurrentRoot", {
  defaultValue: () => () => undefined
})

/**
 * A Subscription may carry a function under this key. No Stream runs on the
 * server, so there the runtime calls it once per render, for the root's
 * Subscriptions only, with the root's context and the problems sink.
 *
 * @internal
 */
export const onServer: unique symbol = Symbol.for("@effect/ui/Subscription/onServer") as any

/** @internal */
export interface OnServer {
  readonly [onServer]?: (context: Context.Context<never>, report: RootHandle["report"]) => void
}

/**
 * A Subscription may carry a function under this key, which the runtime calls
 * instead of running its Stream. It attaches `emit` to its source and returns
 * `initial`, run on the scheduler as the Stream would start, and `close`, run
 * when the Subscription stops. `emit` dispatches synchronously, unless the
 * Subscription has stopped, and then the message is dropped. It calls
 * `accepted` right before a dispatch, and never for a dropped message. A
 * defect in the Subscription's own code goes to `fail`, which fails the
 * subscribing instance as a failed Stream would, so it never reaches the
 * source. It returns `undefined` when it can't attach, and the runtime runs
 * the Stream instead.
 *
 * `enter` renders the dirty ancestors, then calls `f` with the key's latest
 * declaration, unless the Subscription has stopped. `emit` enters the same
 * way. A source that calls user code, such as `Html.onDocument`'s handler,
 * does so inside `enter`, so a stale declaration never runs.
 *
 * `Router.subscription` uses it, so a navigation reaches the root inside the
 * flush whose Command made it.
 *
 * @internal
 */
export const direct: unique symbol = Symbol.for("@effect/ui/Subscription/direct") as any

/** @internal */
export interface Direct {
  readonly [direct]?: (
    context: Context.Context<never>,
    emit: (message: unknown, accepted: () => void) => void,
    fail: (cause: Cause.Cause<unknown>) => void,
    enter: (f: (latest: Subscription.Subscription<unknown, unknown>) => void) => void
  ) => { readonly initial: Effect.Effect<void>; readonly close: () => void } | undefined
}

/**
 * Whether a Command is a navigation, which the runtime runs in the deferred
 * work of the flush that issued it rather than on the scheduler: `Push`,
 * `Replace`, `PatchSearch`, `Back`, `Forward` and `Load`, whose names
 * share the prefix.
 *
 * @internal
 */
export const isNavigation = (command: { readonly name: string; readonly service?: unknown }): boolean =>
  command.service !== undefined && command.name.startsWith("@effect/ui/Router/")
