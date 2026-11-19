/**
 * The runtime: instances, their Scopes, Commands, Subscriptions and provided
 * Layers, and the component-bounded virtual DOM that keeps a host in step.
 *
 * @internal
 */
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Scheduler from "effect/Scheduler"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as Command from "../../Command.ts"
import type * as Component from "../../Component.ts"
import * as Feature from "../../Feature.ts"
import * as Head from "../../Head.ts"
import type * as MessageLog from "../../MessageLog.ts"
import type * as Query from "../../Query.ts"
import type * as Renderer from "../../Renderer.ts"
import * as Subscription from "../../Subscription.ts"
import * as View from "../../View.ts"
import { propsEqual, sharedEqual } from "../equal.ts"
import * as Executor from "../executor.ts"
import * as headFold from "../headFold.ts"
import * as match from "../match.ts"
import { isKeyed, keyOf } from "../match.ts"
import * as messageLog from "../messageLog.ts"
import type * as mountArgs from "../mountArgs.ts"
import { isNoop } from "../noop.ts"
import {
  checkAuthorPlacements,
  checkAuthorRefs,
  checkChildPaths,
  checkContentPaths,
  checkFallbackPaths,
  type ChildPaths,
  segment,
  segmentOf,
  slotSegment
} from "../paths.ts"
import type * as prefetch from "../prefetch.ts"
import type * as componentQueries from "../queries.ts"
import * as queryCore from "../queryCore.ts"
import * as schedule from "../schedule.ts"
import { holdsRedacted } from "../schemaRedact.ts"
import { scopeAddFinalizerUnsafe, scopeRemoveFinalizerUnsafe } from "../scope.ts"
import * as serverHost from "../serverHost.ts"
import * as services from "../services.ts"
import * as sharedReads from "../shared.ts"
import { serverFailure, type SlotResult } from "../slotStatus.ts"
import * as subscriptionKeys from "../subscriptions.ts"

// ---------------------------------------------------------------------------
// Envs: the Context an instance resolves its services from
// ---------------------------------------------------------------------------

/**
 * The Context instances resolve from. A provided Layer gives its instance (or,
 * when shared, every instance resolving from the same parent Env) a new Env
 * that settles when the Layer is built.
 */
interface Env {
  ctx: Context.Context<any> | undefined
  failure: Cause.Cause<unknown> | undefined
  /**
   * What the boundary records about its Layer, written with the entry that logs each transition. The
   * feature slots that resolve from it read it, never `ctx` or `failure`.
   */
  status: Status
  /**
   * What the shared Layers resolving from this Env are built with, made on first use: a fork of the
   * map its Context was built with, so it reuses what an ancestor built and keeps what it builds.
   */
  memoMap: Layer.MemoMap | undefined
  readonly parent: Env | undefined
  /** On the server: a Layer that is never built there, or one below it. It never settles. */
  readonly never: boolean
  readonly waiters: Array<{
    readonly ready: (ctx: Context.Context<any>) => void
    readonly failed: ((cause: Cause.Cause<unknown>) => void) | undefined
  }>
}

/**
 * A provide boundary's recorded status, and what a slot shows. `Pending` while its Layer builds,
 * `Rebuilding` while a keyed provide builds a new selection, `Awaiting` while an instance the server
 * rendered with its services waits for the client's build, then `Ready` or `Failed`. A slot showing a
 * failed child records `Failed` with the child's failure.
 */
type Status =
  | { readonly _tag: MessageLog.LayerPending["status"] | "Ready" }
  | { readonly _tag: "Failed"; readonly cause: Cause.Cause<unknown> }
/** The statuses a page ships: the ones a server render can end on, other than `Ready`. */
type Shipped = "Pending" | "Failed"
const pendingStatus: Status = { _tag: "Pending" }
const rebuildingStatus: Status = { _tag: "Rebuilding" }
const awaitingStatus: Status = { _tag: "Awaiting" }
const readyStatus: Status = { _tag: "Ready" }
/** What a slot's `fallback` is passed for a status other than `Ready`. */
const resultOf = (status: Status): SlotResult =>
  status._tag === "Failed" ? AsyncResult.failure(status.cause) : AsyncResult.initial(true)

const readyEnv = (ctx: Context.Context<any>, parent?: Env): Env => ({
  ctx,
  failure: undefined,
  status: readyStatus,
  memoMap: undefined,
  parent,
  waiters: [],
  never: false
})
const buildingEnv = (parent: Env, never = parent.never, status: Status = pendingStatus): Env => ({
  ctx: undefined,
  failure: undefined,
  status,
  memoMap: undefined,
  parent,
  waiters: [],
  never
})
/** The nearest Env with services: what a fallback, or work after a handled Layer failure, runs against. */
const settled = (env: Env): Env => env.ctx !== undefined ? env : settled(env.parent!)
const whenReady = (
  env: Env,
  ready: (ctx: Context.Context<any>) => void,
  failed?: (cause: Cause.Cause<unknown>) => void
) => {
  if (env.ctx !== undefined) ready(env.ctx)
  else if (env.failure !== undefined) failed?.(env.failure)
  else env.waiters.push({ ready, failed })
}
const resolveEnv = (env: Env, ctx: Context.Context<any>) => {
  env.ctx = ctx
  env.status = readyStatus
  for (const waiter of env.waiters.splice(0)) waiter.ready(ctx)
}
/** Fails `env` with `cause`. Its feature slots get `shown`, which the server substitutes. */
const failEnv = (env: Env, cause: Cause.Cause<unknown>, shown = cause) => {
  env.failure = cause
  env.status = { _tag: "Failed", cause: shown }
  for (const waiter of env.waiters.splice(0)) waiter.failed?.(cause)
}
const memoMapOf = (env: Env): Layer.MemoMap => env.memoMap ??= Layer.CurrentMemoMap.forkOrCreate(env.ctx!)

/** What a keyed provide's keys read: one value per keyed provide, or the defect a key threw. */
type Keys = ReadonlyArray<unknown> | { readonly defect: unknown }
const readKeys = (component: Component.Any, props: unknown, model: unknown): Keys => {
  try {
    return component.layerKeys!.map((key) => key(props, model))
  } catch (defect) {
    return { defect }
  }
}
/** The keys a selection builds from. A key that threw fails the build with its defect. */
const keysOrThrow = (keys: Keys): ReadonlyArray<unknown> => {
  if (Array.isArray(keys)) return keys
  throw (keys as { readonly defect: unknown }).defect
}
/** By `Equal.equals`, key by key. A key that throws again is no change, so a failing key fails once. */
const sameKeys = (a: Keys, b: Keys): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.every((key, index) => Equal.equals(key, b[index]))
    : !Array.isArray(a) && !Array.isArray(b)

// ---------------------------------------------------------------------------
// Rendered tree
// ---------------------------------------------------------------------------

type Rendered = RElement | RText | RChild | RFallback | ROutlet | RDetached

/**
 * A rendered element. A patch updates it in place, so a node that stays keeps
 * its record and the list it is in can tell nothing moved.
 */
interface RElement {
  readonly _tag: "Element"
  v: View.Element<any, any>
  readonly node: unknown
  /** One child is held as it is, and none as `undefined`: only two or more take a list. */
  children: Rendered | Array<Rendered> | undefined
  // Set only on an element that has them, so most records hold four fields.
  mount?: RunningMount | undefined
  /** The mounts of the element's owned layers, by owner and mount name. */
  ownedMounts?: ReadonlyArray<OwnedMount> | undefined
}

/**
 * A started mount: its Scope, the mount the element last rendered with, and the args its `changes`
 * Stream reads, kept from when `changes` is first read.
 */
interface RunningMount {
  readonly scope: Scope.Closeable
  cutBy: number | undefined
  mount: View.Mount<any>
  args: mountArgs.MountArgs | undefined
}

interface OwnedMount {
  readonly owner: View.Owner
  readonly name: string
  readonly running: RunningMount | undefined
}

/** One owner's handler for an event on an element that parts decorated. */
interface EventLayer {
  readonly inst: Instance
  readonly handler: View.Handler<any, any>
  /** The layer's own `preventDefault: true`: only its message prevents the default. */
  readonly prevents: boolean
}

/** What the host stores for an event with more than the author's layer. It is opaque to the host. */
class Layered {
  readonly layers: Array<EventLayer> = []
}

const none: ReadonlyArray<never> = []

/** A rendered element's children as a list, made for the one child that is held without one. */
const listOf = (children: Rendered | Array<Rendered> | undefined): ReadonlyArray<Rendered> =>
  children === undefined ? none : Array.isArray(children) ? children : [children]
/** How a rendered element holds a list of children. */
const packed = (children: Array<Rendered>): Rendered | Array<Rendered> | undefined =>
  children.length > 1 ? children : children[0]

/**
 * The list an instance holds until it adds to it: frozen, so an append to it fails loudly. Compare
 * with it before the first append.
 */
const emptyList: Array<never> = Object.freeze([]) as unknown as Array<never>

/**
 * For each event a part handles, the paths of the instances that get it, deepest owner first and the
 * view's author last. An event only the author handles isn't listed. What `TestElement.owners` shows.
 *
 * @internal
 */
// oxlint-disable-next-line effect/no-unused-internal -- read through the runtime the kernel stands in for
export const eventOwners = (
  handlers: Readonly<Record<string, unknown>>
): Readonly<Record<string, ReadonlyArray<string>>> => {
  const out: Record<string, ReadonlyArray<string>> = {}
  for (const event in handlers) {
    const handler = handlers[event]
    if (handler instanceof Layered) out[event] = handler.layers.map((layer) => layer.inst.path)
  }
  return out
}

interface RText {
  readonly _tag: "Text"
  v: View.Text
  readonly node: unknown
}

interface RChild {
  readonly _tag: "Child"
  v: View.Child<any, any>
  readonly inst: Instance
}

// The records a page holds most of, one for each element, text and child, are made by classes with
// their `_tag` on the prototype: a field less on each.
class ElementRecord implements RElement {
  declare readonly _tag: "Element"
  declare mount?: RunningMount | undefined
  declare ownedMounts?: ReadonlyArray<OwnedMount> | undefined
  v: View.Element<any, any>
  readonly node: unknown
  children: Rendered | Array<Rendered> | undefined
  constructor(v: View.Element<any, any>, node: unknown, children: Rendered | Array<Rendered> | undefined) {
    this.v = v
    this.node = node
    this.children = children
  }
}
class TextRecord implements RText {
  declare readonly _tag: "Text"
  v: View.Text
  readonly node: unknown
  constructor(v: View.Text, node: unknown) {
    this.v = v
    this.node = node
  }
}
class ChildRecord implements RChild {
  declare readonly _tag: "Child"
  v: View.Child<any, any>
  readonly inst: Instance
  constructor(v: View.Child<any, any>, inst: Instance) {
    this.v = v
    this.inst = inst
  }
}
Object.defineProperty(ElementRecord.prototype, "_tag", { value: "Element" })
Object.defineProperty(TextRecord.prototype, "_tag", { value: "Text" })
Object.defineProperty(ChildRecord.prototype, "_tag", { value: "Child" })

/** A placed outlet: what the receiver's parent passed for one slot, rendered by an instance of its own. */
interface ROutlet {
  readonly _tag: "Outlet"
  v: View.Outlet
  readonly inst: Instance
}

/** What a receiver's parent last passed for its slots, and the outlets that place them. */
interface Slotted {
  values: Readonly<Record<string, View.Input<any, any>>> | undefined
  /** The Env at the receiver's child node: the content resolves its services from it. */
  readonly env: Env
  readonly placed: Map<string, Instance>
}

/** An outlet instance: the receiver's slots it shows one of, and the content it last rendered. */
interface OutletOf {
  readonly slotted: Slotted
  /** The outlet node last placed, which names the slot and carries the check its element needs. */
  view: View.Outlet
  content: unknown
}

/** A child showing its `fallback`: its feature service is building or failed, or the child failed. */
interface RFallback {
  readonly _tag: "Fallback"
  readonly v: View.Child<any, any>
  readonly inner: Rendered
  /** The slot's recorded status: its feature's boundary's, or `Failed` with a failed child's failure. */
  readonly status: Status
  /** A failed child, not its feature's Layer, put it here: it stays until the key changes. */
  readonly failedChild: boolean
}

/**
 * A child declared `detached`: what it shows is patched as usual, in `container`, and `node`, an empty
 * text node, stands in the parent's tree for it.
 */
interface RDetached {
  readonly _tag: "Detached"
  v: View.Child<any, any>
  inner: RChild | RFallback
  readonly node: unknown
  readonly container: unknown
}

/** How many times one instance may deliver sends in a flush before it fails. */
const maxSendPasses = 100

/** What a keyed old's index is replaced with in the map of keys once a node has taken it. */
const taken = -1

/**
 * The child rendered with the ref `key` in the trees one author wrote: its view, the fallbacks shown
 * in it, and the closures of the headless children declared there, which it wrote too. Each render
 * checks that at most one child across them has the key.
 */
const findChild = (rendered: ReadonlyArray<Rendered>, key: string): RChild | RFallback | undefined => {
  for (const r of rendered) {
    let found: RChild | RFallback | undefined
    if (r._tag === "Element") {
      found = findChild(listOf(r.children), key)
    } else if (r._tag === "Detached") {
      found = findChild([r.inner], key)
    } else if (r._tag === "Child" || r._tag === "Fallback") {
      if (r.v.ref !== undefined && r.v.ref.key === key) return r
      if (r._tag === "Fallback") found = findChild([r.inner], key)
      else if (r.inst.owner !== undefined) found = findChild(r.inst.rendered, key)
      else found = firstInOutlets(r.inst, (out) => findChild(out.rendered, key))
    }
    // An outlet in the tree shows what another author wrote, so the search passes it by.
    if (found !== undefined) return found
  }
  return undefined
}

// Kept beside the instances, so a component without slots carries no field for them.
const slottedBy = new WeakMap<Instance, Slotted>()
const outletOf = new WeakMap<Instance, OutletOf>()

/**
 * The first result of `f` over the outlets `receiver` places. Their content was written by the author
 * of the tree `receiver` sits in, so a search of that author's trees goes into them.
 */
const firstInOutlets = <A>(receiver: Instance, f: (out: Instance) => A | undefined): A | undefined => {
  // Read first: most components declare no slots, and this is cheaper than the map.
  if (receiver.component.definition.slots.length === 0) return undefined
  const slotted = slottedBy.get(receiver)
  if (slotted === undefined) return undefined
  for (const out of slotted.placed.values()) {
    if (out.closed) continue
    const found = f(out)
    if (found !== undefined) return found
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

interface Run {
  readonly command: Command.Issued<any, any, never, "Effect"> | Command.Issued<any, any, never, "Stream">
  readonly issued: MessageLog.Issued
  /**
   * The run at the cache, begun at issue. `undefined` for a `Command.make` Command, and for a run issued
   * before the app loaded `Query`: one with `writes` gets its run when the cache is made.
   */
  handle: Query.RunHandle | undefined
  status: schedule.Status
  fiber: Fiber.Fiber<unknown, unknown> | undefined
  done: boolean
  /**
   * From fiber exit until delivery: the result an awaiting run holds, and its source. A silent result
   * (`Component.noop`) is held like a message, so `held !== undefined` always means awaiting.
   */
  held: { readonly message: unknown; readonly source: MessageLog.Source } | undefined
  /**
   * Whether every result the run has had so far (its Effect's result, each Stream element, a mapped
   * failure) was `Component.noop`. `undefined` until the first result.
   */
  silent: boolean | undefined
  /** The run's span, once it began: for `CommandEnded` and `CommandInterrupted`. */
  spanId: string | undefined
  traceId: string | undefined
  /** Whether the run's own `Command.afterRefetch` wait is going on. */
  waiting: boolean
  /** How the run's own wait ended, and what it still awaited then. */
  waited: Pick<MessageLog.CommandEnded, "waitEnded" | "outstanding"> | undefined
  /** Stops the budget's sleep and the cache's callback. */
  cancelWait: (() => void) | undefined
  /** The entry that started the step that stopped the run, for the `CommandInterrupted` its fiber's exit logs. */
  cutBy: number | undefined
}

interface SubscriptionRun {
  /** The name and deps the key was built from, for the entry that logs its stop. */
  readonly name: string
  readonly deps: ReadonlyArray<Subscription.Dep> | undefined
  readonly scope: Scope.Closeable
  fiber: Fiber.Fiber<unknown, unknown> | undefined
  /** The declaration from the latest `subscriptions` result that listed the key. */
  latest: Subscription.Subscription<any, any>
}

/** One query's cache watcher, registered from its watch marker. */
interface WatchRun {
  marker: componentQueries.Marker
  /** The name a failure of the watcher is logged with: the Subscription key with the log key in place of the args key. */
  readonly logKey: string
  handle: ReturnType<ReturnType<typeof Query.internals>["watch"]> | undefined
  released: boolean
  /** A debounced query's sleep on the Clock: the watcher registers when it ends. */
  debounce: Fiber.Fiber<unknown> | undefined
}

/**
 * One keyed query's watchers, collected: the last value of each key, and the
 * keys that changed since the query's result was last written.
 */
interface KeyedRun {
  group: componentQueries.Group
  readonly logKey: string
  readonly values: Map<string, { readonly args: unknown; readonly result: Settled; readonly patched: boolean }>
  readonly changes: Set<string>
}

type Settled = AsyncResult.Success<any, any> | AsyncResult.Failure<any, any>

/** @internal */
export interface Instance {
  readonly path: string
  /** What `h.lazy` built in the last render. */
  lazy: View.Lazies | undefined
  /** Counts the root's instances in creation order: the check after a push skips older ones. */
  readonly born: number
  readonly depth: number
  readonly component: Component.Any
  readonly parent: Instance | undefined
  /** The entry that started the step that last marked it dirty, until it renders. */
  cause: number | undefined
  /**
   * Who wrote the tree this instance renders: the instance itself, or for a headless instance the
   * author of the tree it sits in.
   */
  author: Instance
  /** A headless instance: who its parts' layers belong to. */
  readonly owner: View.Owner | undefined
  /** A headless instance: the closure that is its view, as last declared. */
  content: ((parts: any) => View.Content<any, any>) | undefined
  readonly scope: Scope.Closeable
  env: Env
  /** A keyed provide's selection, on the client. `undefined` without one. */
  selection: Selection | undefined
  /** `noChildren`, shared, until the first child is added: only `createChild` adds one. */
  children: Set<Instance>
  props: unknown
  model: unknown
  /** The query results, beside the Model: what each query last returned. */
  results: componentQueries.Results | undefined
  onEmit: (events: unknown) => unknown
  onFailure: ((failure: AsyncResult.Failure<never, unknown>) => unknown) | undefined
  failure: Cause.Cause<unknown> | undefined
  /** What the current or last render uses: each fallback it shows is checked against it, and adds to it. */
  childPaths: ChildPaths | undefined
  /**
   * A fallback in this render that clashed with `childPaths`. It shows nothing, and the render
   * fails once its nodes are in place, so the instance closes over what it rendered.
   */
  clash: unknown
  rendered: Array<Rendered>
  /**
   * From the moment its Scope or an ancestor's starts closing, not once it has: nothing new starts
   * in a teardown that an async cleanup holds open, its own or one that a sequential close of an
   * ancestor reaches first, while that cleanup stays owned to its end.
   */
  readonly closed: boolean
  /** Hydration: the provided Layer is still building, so the server's nodes wait, inert. */
  waiting: boolean
  /** Hydration: whether this instance's children may adopt the server's Models. */
  adoptsChildren: boolean
  /** On the server: the client builds this instance fresh, because its Layer wasn't built. */
  deferred: boolean
  runs: Array<Run>
  // The collections below are made on their first entry: most instances never hold one, and an
  // empty Map or Set costs about 150 bytes.
  /** `Unmounted` is logged: the instance left the tree, though its Scope may still be closing. */
  left: boolean
  /** How many instances that declare a head are in the tree at or below it: see `declaresHead`. */
  heads: number
  /** The containers of the detached children its view declares, unregistered when it leaves. */
  parked: Set<unknown> | undefined
  /**
   * The closes still running of Scopes forked from this instance's and closed early: removed
   * descendants, stopped Subscriptions and mounts. Their cleanup can use this instance's services,
   * so its close, and a key change, wait for them.
   */
  closes: Set<Fiber.Fiber<void>> | undefined
  subscriptions: Map<string, SubscriptionRun> | undefined
  watches: Map<string, WatchRun> | undefined
  /** The watches followed a Model after mount: from then on, a debounced query's new args may wait. */
  watchesSynced: boolean
  /**
   * Every entry a watch of this instance registered on, by query name and args key. Kept only for an
   * instance created while a check after a navigation is outstanding, and dropped when none is.
   */
  watched: Set<string> | undefined
  /** The instance's `Router.prefetch` declaration, registered with the Router. */
  prefetch: { declaration: services.Prefetch; release: (() => void) | undefined } | undefined
  keyed: Map<string, KeyedRun> | undefined
  /** A drain of the keyed queries is queued in the flush's deferred work. */
  keyedQueued: boolean
  /** The cancels of this instance's load mores still waiting: closing it drops them. */
  loadMores: Set<() => void> | undefined
  /**
   * Set while the first emissions are folded before the first render: the Commands of those
   * updates, issued after `init`'s.
   */
  mounting: Array<{ readonly command: Command.Command<any, any>; readonly issued: MessageLog.Issued }> | undefined
  /** The `$.send`s to children of updates whose render hasn't happened yet: delivered at the end of it. */
  outbox: Array<{ readonly send: Component.Send.ToChild; readonly issued: MessageLog.Issued }>
  /** An owner of shared state: what its `shares` last returned. */
  shares: unknown
  /** An owner of shared state: the instances below it that read it, marked dirty when its value changes. */
  readers: Set<Instance> | undefined
  /** An owner of shared state: what its readers' `onChange` and its `collects` need. */
  readonly owning: Owning | undefined
  /**
   * A reader of shared state: the owner instance of each definition it reads, found at mount. An optional
   * owner that isn't above it has no entry.
   */
  owners: Map<Component.Definition.Any, Instance> | undefined
  /** A reader with an `onChange`: the value of each owner its `onChange` last saw. */
  seen: Map<Instance, unknown> | undefined
  readonly dispatch: (message: unknown, source: MessageLog.Source) => void
  readonly fire: Renderer.Dispatch
}

/** An owner of shared state: what its readers' `onChange` and its `collects` need. */
interface Owning {
  /** The entry that last changed the shared value: a reader's `onChange` message points at it. */
  seq: number
  /** A round of the readers' `onChange` is in the flush's deferred work. */
  round: boolean
  /** What `collects.onChange` last returned, read first as its message for no reports. */
  collected: { readonly message: unknown } | undefined
  /** Hydration: `collected` is the server's, and no comparison has run on the client yet. */
  restored: boolean
}

/**
 * A keyed provide's current selection. Each selection builds into an Env of its own, so a change of
 * key leaves the instance a new Env and remounts everything that resolved from the old one.
 */
interface Selection {
  readonly parentEnv: Env
  keys: Keys
  /** The Model and props the keys were last read from. The next read is due only if they differ. */
  model: unknown
  props: unknown
  /**
   * An update or new props since the last read point, before the next view. The runs issued meanwhile
   * wait for that point, whether or not the keys are read there.
   */
  due: boolean
  /** The Scope the current selection's Layer builds in. The instance's Scope closes it, and the retired ones. */
  scope: Scope.Closeable
  /**
   * The last selection that was built, kept while the current one builds. It is released once that
   * build settles and once the work stopped against it has exited.
   */
  retired: Retired | undefined
  /** The releases of earlier selections still running: the instance's close waits for each to end. */
  readonly releasing: Set<Fiber.Fiber<void>>
  /** The runs issued while a read is due: a change of key keeps them, and they run against the new services. */
  readonly issued: Set<Run>
  /** What waits for the read to bind to an Env: those runs' starts, and load mores. */
  held: Array<() => void>
  /** A Subscription sync skipped while a read was due, so none starts against services about to go. */
  skipped: boolean
}

/** The Model and query results an instance adopts instead of `init`'s: the server's, or history's. */
type Adopted = Option.Option<{ readonly model: unknown; readonly results: componentQueries.Results | undefined }>

interface Retired {
  readonly scope: Scope.Closeable
  readonly waits: Array<Fiber.Fiber<unknown, unknown>>
}

/**
 * The children of every instance that has none: reads and deletes leave it empty, and an
 * instance's first child replaces it with a Set of its own.
 */
const noChildren: Set<Instance> = new Set()

/** @internal */
export interface Pending {
  readonly path: string
  readonly name: string
  readonly status: string
}

/** @internal */
export interface Root {
  readonly path: string
  readonly session: string
  readonly instance: Instance
  readonly emitted: ReadonlyArray<unknown>
  readonly find: (path: string) => Instance | undefined
  readonly model: () => unknown
  readonly send: (message: unknown) => void
  /** The Commands still running, queued, awaiting or stopping anywhere in the tree. */
  readonly pending: () => ReadonlyArray<Pending>
  /** The query cache the runtime owns, read where the `Query` module is loaded. */
  readonly cache: ReturnType<typeof Query.internals>
  /** Why the root failed, once it has. */
  readonly crashed: () => Cause.Cause<unknown> | undefined
  /** The current flush: 0 for the first render, then one more per flush. */
  readonly flush: () => number
  /**
   * How many provided Layer builds that began in `flush` or later are still
   * pending, tree-wide. A failed build counts as settled. The router's settle
   * condition reads this.
   */
  readonly buildsPendingSince: (flush: number) => number
  /** The head the last fold computed, in the root vocabulary's form, whether or not the host applies it. */
  readonly head: () => unknown
  /**
   * Hydration: the head of the state every instance adopted, each evaluated at its adoption, before any
   * update of its own. `undefined` until the last instance adopts, and on a mount that didn't hydrate or
   * didn't ask for it with the `adoptionHead` option.
   */
  readonly adoptionHead: () => unknown
  /** Completes once no child is waiting to adopt the server's nodes. */
  readonly adopted: Effect.Effect<void>
  /** Hydration: the paths of the children still waiting for their Layer before they adopt. */
  readonly waiting: () => ReadonlyArray<string>
  /** On the server: calls `f` once nothing is in flight. */
  readonly whenIdle: (f: () => void) => void
  /** On the server: settles what's left synchronously and stops the tree. Returns its cache, if it made one. */
  readonly freeze: () => queryCore.Cache | undefined
}

/** The options `start` takes. */
interface Options {
  readonly fallback?:
    | ((failure: AsyncResult.Failure<never, unknown>, h: any) => View.Content<never, any>)
    | undefined
  /** Hydration: the server's state. The container holds the server's nodes. */
  readonly state?: Renderer.State | undefined
  /** Server rendering. */
  readonly server?: ServerOptions | undefined
  /** Cache-wide options for the query cache the runtime owns. */
  readonly query?: Renderer.QueryOptions | undefined
  /** `false`: the head is computed but never given to the host. */
  readonly head?: boolean | undefined
  /** Hydration: keeps the head of the adopted state for `Root.adoptionHead`, as `Ssr` asks, to compare it. */
  readonly adoptionHead?: boolean | undefined
}

interface ServerOptions {
  readonly host: Renderer.Host<any>
  /** False with a budget of 0: the per-request cache starts no fetch. */
  readonly fetches: boolean
}

/** A Schema as JSON. */
const jsonCodecs = new WeakMap<object, {
  readonly encode: (model: unknown) => Option.Option<unknown>
  readonly decode: (encoded: unknown) => Option.Option<unknown>
}>()
const jsonCodecOf = (schema: Schema.Codec<any, any>) => {
  let found = jsonCodecs.get(schema)
  if (found === undefined) {
    const codec = Schema.toCodecJson(schema as Schema.Codec<unknown, unknown>)
    found = { encode: Schema.encodeUnknownOption(codec), decode: Schema.decodeUnknownOption(codec) }
    jsonCodecs.set(schema, found)
  }
  return found
}

/**
 * An instance's state as JSON, for page state and history restore: its Model, and for a component
 * with queries, `{ model, queries }` with the query results.
 *
 * A state whose Schema holds a `Schema.Redacted` anywhere is never serialised: JSON would hold the
 * secret. Its codec encodes and decodes nothing, so the server defers the instance and history keeps
 * no entry for it, and state an older build wrote isn't adopted either.
 */
const stateCodecs = new WeakMap<object, StateCodec>()
interface StateCodec {
  readonly redacted: boolean
  readonly encode: (model: unknown, results: componentQueries.Results | undefined) => Option.Option<unknown>
  readonly decode: (
    encoded: unknown
  ) => Option.Option<{ readonly model: unknown; readonly results: componentQueries.Results | undefined }>
}
const redactedState: StateCodec = { redacted: true, encode: () => Option.none(), decode: () => Option.none() }
/** @internal */
export const stateCodecOf = (component: Component.Any): StateCodec => {
  let found = stateCodecs.get(component)
  if (found === undefined) {
    const schema = (component as Component.Component<any, any, any, any, any, any, any>).model
    const bound = queryCore.boundOf(component)
    if (holdsRedacted(schema.ast) || (bound !== undefined && holdsRedacted(bound.schema.ast))) {
      found = redactedState
    } else if (bound === undefined) {
      const codec = jsonCodecOf(schema)
      found = {
        redacted: false,
        encode: (model) => codec.encode(model),
        decode: (encoded) => Option.map(codec.decode(encoded), (model) => ({ model, results: undefined }))
      }
    } else {
      const codec = jsonCodecOf(Schema.Struct({ model: schema, queries: bound.schema }))
      found = {
        redacted: false,
        encode: (model, results) => codec.encode({ model, queries: results ?? bound.empty }),
        decode: (encoded) =>
          Option.map(codec.decode(encoded), (state: any) => ({ model: state.model, results: state.queries }))
      }
    }
    stateCodecs.set(component, found)
  }
  return found
}

/** The components the server has warned about, once each: a `Redacted` in state turns hydration off below them. */
const warnedRedacted = new WeakSet<Component.Any>()

/** An entry of the cache, by query name and args key: what a watch registered on, or a prefetch fetched. */
const entryKey = (query: string, argsKey: string): string => `${query}\u0000${argsKey}`

const emptyText: View.Text = { _tag: "Text", text: "" }
const ignoreEvents = () => undefined

/** How a root folds its head when its vocabulary has no fold of its own: the title only. */
const neutralFold: View.HeadFold<Head.Entry, Head.Head> = { merge: Head.merge, title: (head) => head.title }

/** The fold of a component's vocabulary, or the title-only one. */
const foldOf = (component: Component.Any): View.HeadFold => component.elements()?.head ?? neutralFold
/** Whether an instance of `component` can add to the head: it has entries of its own, or reduces the ones below it. */
const declaresHead = (component: Component.Any): boolean =>
  component.head !== undefined || component.reduceHead !== undefined

/** One instance's part of the head, over its state when it was read: its entries, its reducer and the instances it placed. */
interface HeadPart {
  readonly inst: Instance
  readonly entries: ReadonlyArray<unknown>
  readonly reduce: ((below: unknown) => unknown) | undefined
  readonly children: ReadonlyArray<Instance>
}

/** A tree with no entries, which folds to the vocabulary's empty head. */
const emptyTree: Head.Tree<any, any> = { entries: [], children: [] }

/** An entry about an instance, without what `record` adds. */
type Draft = MessageLog.InstanceEntry extends infer E
  ? E extends MessageLog.InstanceEntry ? Omit<E, keyof MessageLog.InstanceBase> : never
  : never
/** An entry about the tree, without what `recordTree` adds. */
type TreeDraft = Exclude<MessageLog.Entry, MessageLog.InstanceEntry> extends infer E
  ? E extends MessageLog.Entry ? Omit<E, keyof MessageLog.Base> : never
  : never

let sessions = 0
/** Each runtime's interrupter id for the Layer builds it ends: negative, so never a fiber's. */
let buildInterrupters = 0

/** The server's nodes for one instance: between its two markers. */
interface Range {
  readonly open: unknown
  readonly close: unknown
  /** Whether the instance took these nodes, so whoever declared the child leaves them in place. */
  claimed: boolean
}

// ---------------------------------------------------------------------------
// mount
// ---------------------------------------------------------------------------

/** Root props given as an Effect are resolved once, with the mount's services, before the tree starts. */
const withProps = <A, E, R>(
  rootProps: unknown,
  f: (props: unknown) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.isEffect(rootProps) ? Effect.flatMap(rootProps as Effect.Effect<unknown>, f) : f(rootProps)

/** @internal */
export const mount = (
  component: Component.Any,
  rootProps: unknown,
  container: unknown,
  options?: Options
): Effect.Effect<Root & Renderer.Root<any, any>, never, Scope.Scope | Renderer.Renderer> =>
  withProps(rootProps, (props) =>
    Effect.contextWith((caller: Context.Context<Scope.Scope | Renderer.Renderer>) => {
      const ctx = onScheduler(caller)
      const startOptions = { ...options, server: undefined }
      return Effect.flatMap(
        makeQueryCache(ctx, startOptions),
        (cell) => start(component, props, container, ctx, cell, startOptions)
      )
    }))

/**
 * Renders a tree on the server: on a host that only keeps the node tree,
 * waiting for provided Layers and the per-request cache's fetches until
 * nothing is in flight or the budget runs out, then serialising it once.
 *
 * @internal
 */
// oxlint-disable-next-line effect/no-unused-internal -- read through the runtime the kernel stands in for
export const prerender = (
  component: Component.Any,
  rootProps: unknown,
  options: {
    readonly budget: Duration.Input
    readonly elements: ReadonlyArray<string> | "any"
    readonly static?: boolean | undefined
    /** Where the frozen tree is written, for a caller that writes it itself. The render then builds no `nodes`. */
    readonly sink?: services.ServerSink | undefined
    /** Called once the tree is frozen, before the cache is serialised and its fetches are interrupted. */
    readonly onFinish?: ((cache: ReturnType<typeof Query.internals>) => void) | undefined
  }
): Effect.Effect<Renderer.Prerendered<any>> =>
  withProps(rootProps, (props) =>
    // The render's own Scope closes however it ends, interrupted included: its work runs in fibers of its own.
    Effect.acquireUseRelease(
      Scope.make("sequential"),
      Effect.fnUntraced(function*(scope) {
        const budget = Duration.fromInputUnsafe(options.budget)
        const started = !Duration.isZero(budget)
        const host = serverHost.make(options.elements)
        const ctx = onScheduler(Context.add(yield* Effect.context<never>(), Scope.Scope, scope))
        const startOptions: Options = {
          server: { host, fetches: started }
        }
        const cell = yield* makeQueryCache(ctx, startOptions)
        const root = yield* start(component, props, host.createElement("#root"), ctx, cell, startOptions)
        if (started) {
          yield* Effect.raceFirst(
            Effect.callback<void>((resume) => {
              root.whenIdle(() => resume(Effect.void))
            }),
            Effect.sleep(budget)
          )
        }
        const cache = root.freeze()
        if (cache !== undefined) options.onFinish?.(cache)
        // In the same synchronous step as the freeze: see `serializeTree`.
        const nodes: Array<Renderer.ServerNode> = []
        const state = serializeTree(root.instance, cache, ctx, options.static === true, options.sink ?? nodeSink(nodes))
        return { nodes, state, model: root.model(), head: root.head() }
      }),
      (scope, exit) => Scope.close(scope, exit)
    ))

/**
 * `ctx` with the root's scheduler as its Scheduler, for everything the root forks: the executor's, so
 * the work drains with the runtime's, or else the caller's with one dispatcher for every fiber. A
 * fiber otherwise makes a dispatcher of its own, which queues a task of its own: the Commands one
 * flush issued would each resume in their own task, with a render after each. On one dispatcher they
 * resume in one task, and what they send is rendered once.
 */
const onScheduler = (ctx: Context.Context<any>): Context.Context<any> => {
  const callers = Context.get(ctx, Scheduler.Scheduler)
  let dispatcher: Scheduler.SchedulerDispatcher | undefined
  return Context.add(
    ctx,
    Scheduler.Scheduler,
    Context.get(ctx, Executor.CurrentExecutor).scheduler ?? {
      executionMode: callers.executionMode,
      shouldYield: (fiber) => callers.shouldYield(fiber),
      makeDispatcher: () => dispatcher ??= callers.makeDispatcher()
    }
  )
}

/** A `Redacted` in an instance's state defers it and its subtree, so the client builds them fresh. */
const warnRedacted = (inst: Instance, ctx: Context.Context<any>) => {
  if (warnedRedacted.has(inst.component)) return
  warnedRedacted.add(inst.component)
  Effect.runForkWith(ctx)(
    Effect.logWarning(
      `${inst.component.definition.name}: its state holds a Schema.Redacted, so the server sends no state for it and the ` +
        "client builds it and everything under it fresh, without hydration. Keep the secret in a leaf component " +
        "or in a service."
    )
  )
}

/** The sink that builds `Prerendered.nodes`, for a caller that gave none of its own. */
const nodeSink = (nodes: Array<Renderer.ServerNode>): services.ServerSink => {
  let children = nodes
  const parents: Array<Array<Renderer.ServerNode>> = []
  const into = (next: Array<Renderer.ServerNode>) => {
    parents.push(children)
    children = next
  }
  const out = () => {
    children = parents.pop()!
  }
  return {
    text: (text) => children.push({ _tag: "Text", text }),
    open(tag, attrs, props) {
      const inner: Array<Renderer.ServerNode> = []
      children.push({ _tag: "Element", tag, attrs, props, children: inner })
      into(inner)
    },
    close: out,
    enter(path) {
      const inner: Array<Renderer.ServerNode> = []
      children.push({ _tag: "Range", path, children: inner })
      into(inner)
    },
    leave: out
  }
}

const noSink: services.ServerSink = { text() {}, open() {}, close() {}, enter() {}, leave() {} }

/**
 * Writes a frozen tree to `to` once, in document order, and returns the state the client adopts. It is
 * outside `setup`, and only `prerender` calls it, so a bundle that never renders on a server leaves
 * it out.
 */
const serializeTree = (
  root: Instance,
  cache: queryCore.Cache | undefined,
  ctx: Context.Context<any>,
  isStatic: boolean,
  to: services.ServerSink
): Renderer.State => {
  let sink = to
  // In the same synchronous step as the Models: fetches in flight are interrupted, and their entries
  // revert to cold and aren't shipped. Nothing is dispatched for them.
  const query = cache === undefined ? {} : cache.dehydrate()
  const state: Record<string, unknown> = {}
  const collected: Record<string, unknown> = {}
  const deferredPaths: Array<string> = []
  const statuses: Record<string, Shipped> = {}
  /** Ships a status other than `Ready`: the client starts from it. */
  const ship = (path: string, status: Status) => {
    if (status._tag === "Pending" || status._tag === "Failed") statuses[path] = status._tag
  }
  // `under`: inside a deferred instance, whose subtree the client builds fresh.
  const instance = (inst: Instance, under: boolean) => {
    let inner = under
    if (!under) {
      const codec = stateCodecOf(inst.component)
      // A failed instance, and one kept off the server, are built fresh. One whose Layer is pending
      // or failed ships its status with its state.
      let encoded = inst.failure !== undefined || inst.deferred
        ? Option.none()
        : codec.encode(inst.model, inst.results)
      if (codec.redacted) warnRedacted(inst, ctx)
      // What an owner's reports last sent: the client compares its reports with it. An owner whose
      // message can't be shipped, a `Redacted` in its Schema included, is deferred with its subtree, as a
      // Model adopted without it would get the same message again.
      const last = inst.owning?.collected
      let baseline: Option.Option<unknown> = Option.none()
      if (Option.isSome(encoded) && last !== undefined) {
        const message = inst.component.definition.message
        baseline = holdsRedacted(message.ast) ? Option.none() : jsonCodecOf(message).encode(last.message)
        if (Option.isNone(baseline)) encoded = Option.none()
      }
      if (Option.isNone(encoded)) {
        deferredPaths.push(inst.path)
        inner = true
      } else {
        state[inst.path] = encoded.value
        if (Option.isSome(baseline)) collected[inst.path] = baseline.value
        if (inst.component.layer !== undefined) ship(inst.path, inst.env.status)
      }
    }
    sink.enter(inst.path)
    if (inst.failure === undefined) {
      for (const rendered of inst.rendered) serialize(inst, rendered, inner)
    }
    sink.leave(inst.path)
  }
  const serialize = (inst: Instance, rendered: Rendered, under: boolean): void => {
    switch (rendered._tag) {
      case "Text":
        return sink.text(rendered.v.text)
      case "Element": {
        const view = rendered.v
        sink.open(view.tag, view.attrs, view.props)
        const children = rendered.children
        if (Array.isArray(children)) {
          for (const child of children) serialize(inst, child, under)
        } else if (children !== undefined) serialize(inst, children, under)
        return sink.close(view.tag)
      }
      case "Child":
        return instance(rendered.inst, under)
      case "Outlet": {
        const outlet = rendered.inst
        sink.enter(outlet.path)
        for (const child of outlet.rendered) serialize(outlet, child, under)
        return sink.leave(outlet.path)
      }
      case "Fallback": {
        // A failed child: the client builds it fresh. A feature whose Layer isn't ready: the client
        // adopts the fallback while its status is the one shipped.
        const path = `${inst.path}/${segment(rendered.v)}`
        if (!under) {
          if (rendered.failedChild) deferredPaths.push(path)
          else ship(path, rendered.status)
        }
        sink.enter(path)
        serialize(inst, rendered.inner, true)
        return sink.leave(path)
      }
      case "Detached": {
        // Out of the document, so no nodes: the state of its subtree is still sent, and the client builds
        // its nodes from that state, detached.
        const path = `${inst.path}/${segment(rendered.v)}`
        const shown = sink
        sink = noSink
        serialize(inst, rendered.inner, under)
        sink = shown
        sink.enter(path)
        return sink.leave(path)
      }
    }
  }
  instance(root, false)
  // Added to the record the paths are on, in the order a copy of it would have them: copying a record
  // with a key for each instance costs more than everything else done with it. Defined as a copy would
  // define them, so each is the record's own whatever `Object.prototype` has under its name.
  const add = (key: string, value: unknown) =>
    Object.defineProperty(state, key, { value, writable: true, enumerable: true, configurable: true })
  add("~deferred", deferredPaths)
  if (Object.keys(statuses).length > 0) add("~status", statuses)
  add("~query", query)
  if (Object.keys(collected).length > 0) add("~reported", collected)
  if (isStatic) add("~static", true)
  return state
}

/** `Query`'s functions, where a query or a component's bound queries are at hand: the module is loaded. */
const queryModule = (): queryCore.Loaded => queryCore.loaded!

/**
 * The root's place for its query cache. The cache is made once the app has loaded the `Query` module:
 * at the mount when it has by then, so an app without queries never bundles or builds one. Until then
 * the cell is the `Query.Cache` service, and `Query.internals` makes the cache from it.
 */
interface CacheCell extends queryCore.CacheCell {
  /** The cache, once made. */
  made: queryCore.Cache | undefined
  /** Set by `setup`: called with a cache made after the mount. */
  onMake: ((cache: queryCore.Cache) => void) | undefined
  /** The cache, made now if the `Query` module is loaded. */
  readonly get: () => queryCore.Cache | undefined
}

/**
 * The cache the root owns, disposed with the root's Scope. The runtime re-adds it wherever work runs,
 * so `Component.provide` can't shadow it. Its disposal is registered here, whenever the cache is made,
 * so it runs after the root's own close.
 */
const makeQueryCache = (
  ctx: Context.Context<any>,
  options: Options | undefined
): Effect.Effect<CacheCell> => {
  const server = options?.server
  const cacheOptions: queryCore.CacheOptions = {
    visibility: Context.get(ctx, queryCore.Visibility),
    connectivity: Context.get(ctx, queryCore.Connectivity),
    report: Context.get(ctx, queryCore.Problems),
    idleMs: queryCore.cacheIdleMs(options?.query?.idleTimeToLive),
    // The server's per-request cache: one fetch per key per request, and none with a budget of 0.
    settleOnce: server !== undefined,
    fetches: server === undefined || server.fetches
  }
  let dispose: Effect.Effect<void> | undefined
  let closed = false
  const get = (): queryCore.Cache | undefined => {
    if (cell.made !== undefined) return cell.made
    const query = queryCore.loaded
    if (query === undefined) return undefined
    const built = query.buildCache(ctx, cacheOptions)
    cell.made = built.cache
    dispose = built.dispose
    // Made for a root that has closed: it is disposed at once, with nothing in it.
    if (closed) Effect.runFork(built.dispose)
    cell.onMake?.(built.cache)
    return built.cache
  }
  const cell: CacheCell = {
    [queryCore.CacheTypeId]: queryCore.CacheTypeId,
    [queryCore.CacheCellTypeId]: () => get()!,
    made: undefined,
    onMake: undefined,
    get
  }
  return Effect.acquireRelease(
    Effect.sync(() => {
      get()
      return cell
    }),
    () =>
      Effect.suspend(() => {
        closed = true
        return dispose ?? Effect.void
      })
  ).pipe(Effect.provideContext(ctx))
}

/**
 * Sets up the root in one synchronous step, so no fiber can close its owner Scope halfway. The root
 * registers its finalizers on a Scope of its own, which the owner closes. A callback that closes the
 * owner during setup, such as a `Problems` sink or an `init`, only starts the close: it waits for
 * setup to end, then runs every root finalizer in order, and the setup is interrupted. An owner
 * already closing or closed gets no root.
 */
const start = (
  component: Component.Any,
  rootProps: unknown,
  container: unknown,
  ctx: Context.Context<any>,
  cell: CacheCell,
  options: Options | undefined
): Effect.Effect<Root & Renderer.Root<any, any>> =>
  Effect.suspend(() => {
    const owner = Context.get(ctx, Scope.Scope)
    if (isClosed(owner)) return Effect.interrupt
    const scope = Scope.makeUnsafe("sequential")
    const setUp = Latch.makeUnsafe(false)
    scopeAddFinalizerUnsafe(owner, {}, (exit) => setUp.whenOpen(Scope.close(scope, exit)))
    let root: Root & Renderer.Root<any, any>
    try {
      root = setup(component, rootProps, container, Context.add(ctx, Scope.Scope, scope), cell, options)
    } finally {
      setUp.openUnsafe()
    }
    // A callback may have closed the owner during setup.
    return isClosed(owner) ? Effect.interrupt : Effect.succeed(root)
  })

const isClosed = (scope: Scope.Scope): boolean => scope.state._tag === "Closed"

/** For a fiber that runs a cleanup, which nothing interrupts. */
const uninterruptibly: Effect.RunOptions = { uninterruptible: true }

const setup = (
  component: Component.Any,
  rootProps: unknown,
  container: unknown,
  ctx: Context.Context<any>,
  cell: CacheCell,
  options: Options | undefined
): Root & Renderer.Root<any, any> => {
  const server = options?.server
  const host: Renderer.Host<any> = server !== undefined ? server.host : Context.get(ctx, services.Renderer).host
  const log = Context.get(ctx, messageLog.MessageLog)
  const executor = Context.get(ctx, Executor.CurrentExecutor)
  const clock = Context.get(ctx, Clock.Clock)
  const rootScope = Context.get(ctx, Scope.Scope)
  const session = `${clock.currentTimeMillisUnsafe().toString(36)}-${(sessions++).toString(36)}`
  const controlled = host.controlled
  const rootEmitted: Array<unknown> = []
  const sharedBuilds = new WeakMap<Env, Map<Layer.Layer<any, any, any>, SharedBuild>>()
  const hooks = Option.getOrUndefined(Context.getOption(ctx, services.RootHooks))

  // The problems sink, read once. A throw from it is swallowed: a check only reports.
  const problems = Context.get(ctx, queryCore.Problems)
  const report = (problem: Query.Problem.Any) => {
    try {
      problems(problem)
    } catch {
      // A sink can't change what the runtime does.
    }
  }

  // -- server ---------------------------------------------------------------
  // Set by `finish`: the tree is serialised, and nothing it does from now on counts.
  let frozen = false
  const idleWaiters: Array<() => void> = []

  // -- hydration ------------------------------------------------------------
  const hydration = host.hydration
  // Sets a property of an adopted element: the host's own way, or as on any other element.
  const adoptProp = hydration?.adoptProp ??
    ((node: unknown, name: string, value: unknown) => host.setProp(node, name, value))
  // The server's state, until every instance has adopted.
  let hydrating: {
    readonly state: Renderer.State
    readonly deferred: ReadonlySet<string>
  } | undefined = options?.state === undefined || server !== undefined ? undefined : {
    state: options.state,
    deferred: new Set(options.state["~deferred"] ?? [])
  }
  // Slots still waiting for their Layer before they adopt, and whether the first render is done.
  let waiting = 0
  let started = false
  let adoptedDone = hydrating === undefined
  // Kept past adoption, which drops `hydrating`: the Router reads it when the root's first route arrives.
  const fromStatic = hydrating?.state["~static"] === true
  const adoptedWaiters: Array<() => void> = []
  /**
   * The status the server recorded at `path`, a provide's or a slot's, while hydrating. `~status` is the
   * runtime's own page metadata, not part of `Renderer.State`'s type.
   */
  const shippedStatus = (path: string): Shipped | undefined =>
    (hydrating?.state["~status"] as { readonly [path: string]: Shipped } | undefined)?.[path]
  const settleWaiting = () => {
    // A reader below a held owner may have mounted, or gone.
    if (heldReports.size > 0) {
      for (const owner of heldReports) dueReports(owner)
      heldReports.clear()
    }
    waiting--
    if (waiting === 0 && started) finishAdoption()
  }
  const finishAdoption = () => {
    if (adoptedDone) return
    adoptedDone = true
    hydrating = undefined
    // `adopted` completes at the end of this flush.
    reportPending = true
    // Head sync starts with the flush after adoption.
    viewChanged = true
    wake()
  }

  // -- log ------------------------------------------------------------------
  let seq = 0
  // The entry that what is running follows from: see `step`.
  let origin: number | undefined
  // How many `under` calls are running, and whether the outermost is a step with no entry yet.
  let depth = 0
  let starting = false
  /**
   * Numbers the next entry, and names the entry it follows from: `causedBy` when its caller knows it,
   * and otherwise the entry that started what is running. A step's first entry has none, and starts it.
   */
  const number = (causedBy: number | undefined): Pick<MessageLog.Base, "seq" | "causedBy"> => {
    const next = ++seq
    const cause = causedBy ?? origin
    if (starting) {
      starting = false
      origin = cause ?? next
    }
    return cause === undefined ? { seq: next } : { seq: next, causedBy: cause }
  }
  /** Runs `f` as what follows from the entry `cause`. */
  const under = <A>(cause: number | undefined, f: () => A, start = false): A => {
    const outer = origin
    const outerStarting = starting
    origin = cause
    starting = start && cause === undefined
    depth++
    try {
      return f()
    } finally {
      depth--
      origin = outer
      starting = outerStarting
    }
  }
  /**
   * Runs one step: something from outside the tree (a message, a query result, a run or a Layer build
   * that ended, a timer) and what follows from it before it returns. Its first entry is the fact, and
   * every other entry it logs names that one in `causedBy`, as do the entries of the renders and the
   * deferred work it asked for. A step inside another is part of it.
   *
   * `causedBy` is the entry of an earlier step this one carries on from, as a debounce's delay does.
   */
  const step = <A>(f: () => A, causedBy?: number): A => {
    if (depth > 0) return f()
    try {
      return under(causedBy, f, true)
    } finally {
      // The watchers its `update` registered fetch now, and not at the flush: which args are
      // fetched doesn't depend on what else arrives before it. A render's still wait for its drain.
      if (!draining && watchHold !== undefined) releaseWatchHold()
    }
  }
  /** Logs an entry about the tree, and returns its number. */
  const recordTree = (draft: TreeDraft, causedBy?: number): number => {
    if (!log.enabled) return -1
    const entry = { ...draft, ...number(causedBy), at: clock.currentTimeMillisUnsafe(), session } as MessageLog.Entry
    log.record(entry)
    return entry.seq
  }
  /**
   * The provider whose Layer entries the feature slots in `inst`'s view read: the one above, `inst`
   * included, whose own Env is the one `inst` renders with. None for an Env that is always ready.
   */
  const boundaryOf = (inst: Instance): number | undefined => {
    for (let at: Instance | undefined = inst; at !== undefined; at = at.parent) {
      if (at.component.layer !== undefined && at.env === inst.env) return at.born
    }
    return undefined
  }
  /** Logs an entry about `inst`, and returns its number. */
  const record = (inst: Instance, draft: Draft, causedBy?: number): number => {
    if (!log.enabled) return -1
    const boundary = draft._tag === "Mounted" || draft._tag === "Waiting" || draft._tag === "Update"
      ? boundaryOf(inst)
      : undefined
    const entry = {
      ...draft,
      ...(boundary === undefined ? undefined : { boundary }),
      ...number(causedBy),
      at: clock.currentTimeMillisUnsafe(),
      session,
      path: inst.path,
      instance: inst.born,
      component: inst.component
    } as MessageLog.Entry
    log.record(entry)
    return entry.seq
  }

  // -- fibers ---------------------------------------------------------------
  const withScheduler = (context: Context.Context<any>): Context.Context<any> =>
    executor.scheduler === undefined ? context : Context.add(context, Scheduler.Scheduler, executor.scheduler)
  /** Starts at once, so a Layer that builds synchronously is ready for the first frame. */
  const forkNow = <A, E>(
    context: Context.Context<any>,
    effect: Effect.Effect<A, E, any>,
    options?: Effect.RunOptions
  ): Fiber.Fiber<A, E> => Effect.runForkWith(withScheduler(context))(effect, options)
  /**
   * Starts on the scheduler, never inside the `update` that issued it. A navigation Command starts
   * sooner, in the deferred work of the flush its `update` caused: see `startRun`.
   */
  const forkLater = <A, E>(context: Context.Context<any>, effect: Effect.Effect<A, E, any>): Fiber.Fiber<A, E> =>
    forkNow(context, Effect.andThen(Effect.yieldNow, effect))
  // Every run fiber and every Scope close the runtime has forked, until they exit. The root waits for both.
  const liveRuns = new Set<Fiber.Fiber<unknown, unknown>>()
  const closing = new Set<Fiber.Fiber<void>>()
  /** Layer builds the runtime interrupted, until their own cleanup ends: see `buildLayer`. */
  const releasedBuilds = new Set<Fiber.Fiber<unknown, unknown>>()
  const track = <A, E>(fibers: Set<Fiber.Fiber<A, E>>, fiber: Fiber.Fiber<A, E>) => {
    fibers.add(fiber)
    fiber.addObserver(() => fibers.delete(fiber))
  }
  /**
   * Ends once the fibers tracked when it runs have. Never a wait for the fiber that runs it, should a
   * cleanup close its owner from inside.
   */
  const awaitOthers = (fibers: Set<Fiber.Fiber<any, any>>): Effect.Effect<unknown> =>
    Effect.withFiber((current) => Fiber.awaitAll([...fibers].filter((fiber) => fiber !== current)))
  /**
   * Closing a Scope detaches it from its parent, so the close is tracked until it ends. Its
   * finalizers start at once, as in a fiber started now: only a close left with something to wait
   * for takes a fiber, which is returned.
   */
  const closeScope = (scope: Scope.Closeable): Fiber.Fiber<void> | undefined =>
    settleClose(Scope.closeUnsafe(scope, Exit.void))
  /** What a close returned: nothing left, or an Effect, run now, that a fiber is returned for if it waits. */
  const settleClose = (rest: Effect.Effect<void> | undefined): Fiber.Fiber<void> | undefined => {
    if (rest === undefined || (Exit.isExit(rest) && Exit.isSuccess(rest))) return undefined
    const fiber = forkNow(ctx, rest, uninterruptibly)
    // Ended in the fork: nothing is left to wait for.
    if (fiber.pollUnsafe() !== undefined) return undefined
    track(closing, fiber)
    return fiber
  }
  /**
   * Closes a Scope forked from `owner`'s. A close left running stays `owner`'s until it ends:
   * `owner`'s own close waits for it before its services go, and so does a key change.
   */
  const closeUnder = (owner: Instance | undefined, scope: Scope.Closeable) => {
    closedUnder(owner, closeScope(scope))
  }
  /** Closes an instance, as `closeUnder` closes its Scope, without making a Scope it never needed. */
  const closeInstance = (owner: Instance | undefined, inst: Instance) => {
    closedUnder(owner, settleClose((inst as Inst).close()))
  }
  const closedUnder = (owner: Instance | undefined, fiber: Fiber.Fiber<void> | undefined) => {
    if (fiber === undefined || owner === undefined || isClosed(owner.scope)) return
    if (owner.closes === undefined) {
      // Added after the instance's Layer and selection, so it runs before they close.
      addFinalizer(owner.scope, awaitOthers(owner.closes = new Set()))
    }
    track(owner.closes, fiber)
  }
  /** Adds a finalizer without running an Effect. On a Scope already closed, it runs as a tracked close. */
  const addFinalizer = (scope: Scope.Scope, finalizer: Effect.Effect<unknown>) => {
    if (scope.state._tag === "Closed") track(closing, forkNow(ctx, Effect.asVoid(finalizer)))
    else scopeAddFinalizerUnsafe(scope, {}, () => finalizer)
  }
  /**
   * The close interrupts the fiber and waits for it to exit, so its cleanup runs before whatever the
   * Scope's owner closes next, such as the Layer that provides its services.
   */
  const interruptOnClose = (scope: Scope.Scope, fiber: Fiber.Fiber<unknown, unknown>) =>
    addFinalizer(scope, Fiber.interrupt(fiber))

  // -- query cache ---------------------------------------------------------
  // Made at the mount when the app has loaded the `Query` module by then, and otherwise when it loads it.
  let cache = cell.made
  /** The runs with `writes` issued before the cache was made, in the order they were issued, until they end. */
  let early: Set<Run> | undefined
  /** The cache, where a query is at hand: its module is loaded. */
  const queryCache = (): queryCore.Cache => cache ?? cell.get()!
  const withCache = (context: Context.Context<any>): Context.Context<any> =>
    Context.add(context, queryCore.CacheKey, (cache ?? cell) as unknown as Query.Cache["Service"])
  /**
   * History restore: each query result restored seeds a cold entry, stale, so the first frame shows the data
   * with `waiting: true` while one refetch runs. A snapshot taken under a patch may hold a value that
   * was never saved: it seeds nothing, and the query starts from loading.
   */
  const restoreQueries = (
    component: Component.Any,
    results: componentQueries.Results | undefined
  ): componentQueries.Results | undefined => {
    const bound = queryCore.boundOf(component)
    if (bound === undefined || results === undefined) return results
    const out: Record<string, unknown> = {}
    for (const entry of bound.entries) {
      const snapshot = results[entry.name]
      if (entry.keyed) {
        // Per tuple: one taken under a patch is dropped.
        const map = queryModule().snapshotMapData(snapshot)
        const kept: Array<unknown> = []
        for (const one of map?.entries.values() ?? []) {
          if (queryModule().snapshotData(one)!.patched) continue
          queryCache().seed(one)
          kept.push(one)
        }
        out[entry.name] = map !== undefined && kept.length === map.entries.size
          ? snapshot
          : bound.snapshotMany(entry, kept)
        continue
      }
      const data = queryModule().snapshotData(snapshot)
      if (data !== undefined && !data.patched) {
        queryCache().seed(snapshot)
        out[entry.name] = snapshot
      } else out[entry.name] = bound.empty[entry.name]
    }
    return out
  }
  // Hydration: the server's entries and when they arrived, for a cache made after the mount.
  const hydratedQueries = hydrating?.state["~query"]
  const hydratedStatic = hydrating?.state["~static"] === true
  const hydratedAt = hydratedQueries === undefined ? 0 : clock.currentTimeMillisUnsafe()
  // Adoption or a navigation has closed the fetch-free window.
  let windowClosed = false
  const closeWindow = () => {
    windowClosed = true
    cache?.closeWindow()
  }
  let offFetch: (() => void) | undefined
  let offFetchEnd: (() => void) | undefined
  const attachCache = (made: queryCore.Cache) => {
    cache = made
    // Every fetch the cache starts is logged, as an entry about the tree. A watch's fetch starts when the
    // render pass's hold is released, and follows from the step whose render registered the watcher.
    offFetch = made.onFetch((event) => {
      if (frozen || !log.enabled) return
      recordTree(
        { _tag: "FetchStarted", ...event },
        event.trigger === "watch" ? watchCauses.get(entryKey(event.query, event.logKey)) : undefined
      )
    })
    // On the server a fetch in flight holds the response, so one that ends may make the tree idle.
    if (server !== undefined) offFetchEnd = made.onFetchEnd(() => checkIdle())
    // Hydration: the server's entries, held raw until their queries register. This opens the fetch-free
    // window, which closes at adoption or the first navigation.
    if (hydratedQueries !== undefined) {
      made.hydrate(hydratedQueries, { static: hydratedStatic, at: hydratedAt })
      if (windowClosed) made.closeWindow()
    }
    // The runs issued before the cache was made begin now, in the order they were issued and ahead of
    // every run issued since. One whose work has begun starts before any entry exists, as it did.
    if (early !== undefined) {
      for (const run of early) {
        run.handle = beginRun(made, run.command)
        if (run.spanId !== undefined) run.handle.start()
      }
      early = undefined
    }
  }
  cell.onMake = attachCache
  if (cache !== undefined) attachCache(cache)
  // The root's close waits until every run fiber has exited, stopped ones included, and every Scope
  // close already started, such as an unmounted instance's, has finished.
  let rootClosed = false
  addFinalizer(
    rootScope,
    Effect.suspend(() => {
      rootClosed = true
      offFetch?.()
      offFetchEnd?.()
      releaseWatchHold()
      return awaitAllOwned
    })
  )

  // -- flush ----------------------------------------------------------------
  // Set once the root has mounted and is attached to the Router, if there is one.
  let attached = false
  const dirty = new Set<Instance>()
  const deferred: Array<() => void> = []
  let committed: Array<() => void> = []
  let scheduled = false
  // Counts provided Layer builds as they begin, and the last one that failed, for the check after a push.
  let builds = 0
  let lastFailedBuild = 0
  // Counts instances as they are created.
  let instancesMade = 0
  // The headless instance behind each owner a part stamps on its layers.
  const owners = new WeakMap<View.Owner, Instance>()
  // The checks after a navigation still outstanding, and the instances created meanwhile, whose
  // watches are recorded for them.
  let recording = 0
  const recorded = new Set<Instance>()
  // Each provided Layer build still pending, stamped with the flush it began in.
  let flushes = 0
  const building = new Set<{ readonly flush: number }>()
  // True while the first render or a flush is building nodes the host hasn't committed yet.
  let rendering = true
  const wake = () => {
    if (!scheduled) {
      scheduled = true
      executor.schedule(flush)
    }
  }
  /**
   * The cache hold of the current step or render pass. A watcher registered outside a drain opens one,
   * and the step that registered it releases it when it returns. One registered in a drain is released
   * once nothing is left to render: every release and registration of the pass is in before any
   * zero-to-one decision is made.
   */
  let watchHold: (() => void) | undefined
  // The entry each watcher registered during the hold follows from, by cache entry.
  const watchCauses = new Map<string, number>()
  let draining = false
  const holdWatches = () => {
    if (watchHold !== undefined) return
    watchHold = queryCache().hold()
    if (!draining) wake()
  }
  const isHolding = () => watchHold !== undefined
  const releaseWatchHold = () => {
    const release = watchHold
    watchHold = undefined
    try {
      release?.()
    } finally {
      watchCauses.clear()
    }
  }
  // How many times each instance has delivered sends in this flush: a parent and a child that answer
  // each other would otherwise never leave `drainLoop`.
  const sendPasses = new Map<Instance, number>()
  // How many times each owner of shared state has sent its readers' `onChange` or its own `collects.onChange` in
  // this flush: a reader whose answer changes the shared value again would otherwise never leave `drainLoop`.
  const sharedPasses = new Map<Instance, number>()
  // Owners whose readers' reports may have changed, read once nothing is left to render, with the latest
  // step to change one: the collected message follows from that one.
  const reportsDue = new Map<Instance, number | undefined>()
  const dueReports = (owner: Instance) => {
    reportsDue.set(owner, origin ?? reportsDue.get(owner))
    wake()
  }
  // Hydration: owners whose first comparison waits for an instance below them to adopt.
  const heldReports = new Set<Instance>()
  const markDirty = (inst: Instance) => {
    dirty.add(inst)
    // The latest step to change it: its render logs what follows from that one.
    inst.cause = origin ?? inst.cause
    wake()
  }
  // How many renders and `update` calls are running: nothing renders inside one.
  let busy = 0
  // The instance `renderAbove` is rendering the ancestors of.
  let receiving: Instance | undefined
  /**
   * Renders the dirty instances above `inst`, outermost first, before it is given a message or a
   * query result. Its `update` then reads the props its ancestors' Models give it now, and it is gone
   * when they no longer render it, whenever the flush that would have rendered them runs.
   *
   * `inst` is given its new props and stays dirty: its own view waits for the flush, as it does
   * without a dirty ancestor. A message from a field's event is ahead of the Model that view would
   * render, and rendering it now would write the older value over what the user typed.
   */
  const renderAbove = (inst: Instance) => {
    if (dirty.size === 0 || busy > 0) return
    let top: Instance | undefined
    for (let at = inst.parent; at !== undefined; at = at.parent) if (dirty.has(at)) top = at
    if (top === undefined) return
    const above: Array<Instance> = []
    for (let at = inst.parent; at !== top.parent; at = at!.parent) above.push(at!)
    const outer = receiving
    receiving = inst
    try {
      for (let index = above.length - 1; index >= 0; index--) {
        const next = above[index]!
        // What it rendered is gone with it, `inst` included.
        if (next.closed) return
        if (dirty.delete(next)) renderDirty(next)
      }
    } finally {
      receiving = outer
    }
  }
  const renderDirty = (inst: Instance) => {
    const from = inst.cause
    inst.cause = undefined
    busy++
    try {
      under(from, () => render(inst))
    } finally {
      busy--
    }
    checkPendingRefs()
  }
  const defer = (f: () => void) => {
    const from = origin
    deferred.push(from === undefined ? f : () => under(from, f))
    wake()
  }
  /** Runs `f` once the current render is committed. */
  const afterCommit = (f: () => void) => {
    if (rendering || scheduled || dirty.size > 0) committed.push(f)
    else f()
  }
  function flush() {
    scheduled = false
    rendering = true
    flushes++
    sendPasses.clear()
    sharedPasses.clear()
    drain()
    if (reportPending) reportAdoption()
    host.commit?.()
    afterCommitHooks()
    rendering = false
    runCommitted()
    checkIdle()
  }
  /**
   * Renders what's dirty, runs deferred work and folds the head, until none
   * is left. A `head`, `reduceHead` or title template that throws fails its
   * instance, so the fallback renders and the head is folded again.
   */
  function drain() {
    draining = true
    try {
      drainLoop()
    } finally {
      draining = false
    }
  }
  function drainLoop() {
    do {
      // Before any send is delivered: a mount or a closure that rendered alone leaves its author's refs to check.
      checkPendingRefs()
      while (dirty.size > 0 || deferred.length > 0 || isHolding() || reportsDue.size > 0) {
        if (deferred.length > 0) {
          deferred.shift()!()
          checkPendingRefs()
          continue
        }
        if (dirty.size === 0) {
          // A fetch started here reaches its watchers now, so their updates render in this pass.
          if (isHolding()) releaseWatchHold()
          // Then the pass has nothing left to render, and every report is read from where it settled.
          else deliverReports(reportsDue.keys().next().value!)
          continue
        }
        let next: Instance | undefined
        for (const inst of dirty) {
          if (next === undefined || inst.depth < next.depth) next = inst
        }
        dirty.delete(next!)
        if (!next!.closed) renderDirty(next!)
        else checkPendingRefs()
      }
      foldHead()
    } while (dirty.size > 0 || deferred.length > 0 || isHolding() || reportsDue.size > 0)
  }
  /**
   * Decides whether the server is idle once the current callback has finished:
   * a Layer that settled or a Command that ended may still be about to wake a
   * child, fail an instance or start work.
   */
  let idleCheck = false
  const checkIdle = () => {
    if (idleWaiters.length === 0 || idleCheck) return
    idleCheck = true
    executor.schedule(() => {
      idleCheck = false
      if (scheduled || dirty.size > 0 || deferred.length > 0 || building.size > 0) return
      // Any fetch in flight holds the response: a watch's, a `get`'s, a prefetch nobody renders.
      if (cache !== undefined && cache.pending().length > 0) return
      for (const f of idleWaiters.splice(0)) f()
    })
  }
  const runCommitted = () => {
    const done = committed
    committed = []
    for (const f of done) f()
  }

  // -- head and the router's hook --------------------------------------------
  // Set when a view changed: an instance rendered, or the tree lost or failed an instance.
  let viewChanged = false
  // The root vocabulary's fold, or the title-only one.
  const rootFold = foldOf(component)
  // Under a root fold that folds a subtree with no entries and no `reduce` to nothing, such subtrees
  // are left out of the tree: most instances, such as a list's rows, have no head. A host-neutral root
  // may hand the fold to a vocabulary that sees every node, so its tree is built whole.
  const skipsEmpty = rootFold !== neutralFold && headFold.skipsEmpty(rootFold.merge)
  const emptyHead: unknown = rootFold.merge(emptyTree)
  let merged: unknown = emptyHead
  // The title of `merged`, for the router's hook.
  let mergedTitle: string | undefined
  // Hydration, for a mount that reads `adoptionHead`: each instance's part over the state it adopted, until
  // every instance has adopted. The mount's tree is recorded from its first kept fold, and a subtree that
  // waited for its Layer as it adopts, before the placement its parent rendered meanwhile reaches it. Then
  // the fold of those parts is the head of the adopted state.
  let adoption: Map<Instance, HeadPart> | undefined = hydrating !== undefined && options?.adoptionHead === true
    ? new Map()
    : undefined
  let adoptionHead: unknown = undefined
  // Set when `merged` holds a head the host hasn't been given.
  let headChanged = false
  /** Whether this mount gives its head to the host. An embedded mount computes it and leaves the document alone. */
  const ownsHead = options?.head !== false
  let rootInstance: Instance | undefined
  let handle: services.RootHandle | undefined

  /**
   * One instance's part of the head, read now: its entries, its `reduceHead` over its Model and the
   * instances its view placed. A closed or failed instance has none, and nor does one still waiting to
   * adopt, whose Model isn't there yet, or one whose `head` throws, which `onError` is told. With
   * `below` false the instances it placed aren't looked for: none of them has a part the fold keeps.
   */
  const headPart = (
    inst: Instance,
    onError: (inst: Instance, error: unknown) => void,
    below = true
  ): HeadPart | undefined => {
    if (inst.closed || inst.failure !== undefined || inst.waiting) return undefined
    const head = inst.component.head
    let entries: ReadonlyArray<unknown> = none
    if (head !== undefined) {
      try {
        entries = head(inst.model, inst.props, inst.results)
      } catch (error) {
        onError(inst, error)
        return undefined
      }
    }
    const reduce = inst.component.reduceHead
    const model = inst.model
    let children: Array<Instance> = emptyList
    if (below) {
      children = []
      for (const rendered of inst.rendered) placed(rendered, children)
    }
    return { inst, entries, reduce: reduce === undefined ? undefined : (below) => reduce(model, below), children }
  }
  /** Adds the instances a rendered node places to `out`, in document order: a fallback's content included. */
  const placed = (rendered: Rendered, out: Array<Instance>): void => {
    switch (rendered._tag) {
      case "Child":
      case "Outlet":
        out.push(rendered.inst)
        return
      case "Element": {
        const children = rendered.children
        if (children === undefined) return
        if (!Array.isArray(children)) return placed(children, out)
        for (const child of children) placed(child, out)
        return
      }
      case "Fallback":
        return placed(rendered.inner, out)
      // A detached child's view is out of the document, and its head with it.
      case "Detached":
      case "Text":
        return
    }
  }
  /**
   * Folds the head of the tree under `root`, one node per instance that `partOf` has a part for. What
   * throws in the fold is `onError`'s, with the instance that declared it.
   *
   * The fold is the root vocabulary's, or under a host-neutral root, the first vocabulary's in the tree
   * with a fold of its own, so an Html child keeps its entries. A `reduceHead` of another vocabulary
   * than the fold's has its value laid over `below`: a host-neutral one sets the title and keeps the Html
   * fields.
   */
  const foldTree = (
    root: Instance,
    partOf: (inst: Instance) => HeadPart | undefined,
    onError: (inst: Instance, error: unknown) => void,
    options?: Head.MergeOptions
  ): { readonly head: unknown; readonly title: string | undefined } => {
    let fold = rootFold
    const skip = skipsEmpty
    const node = (inst: Instance): Head.Tree<unknown, unknown> | undefined => {
      const part = partOf(inst)
      if (part === undefined) return skip ? undefined : { path: inst.path, ...emptyTree }
      const own = foldOf(inst.component)
      if (fold === neutralFold) fold = own
      const reduce = part.reduce
      const below = part.children
      const children: Array<Head.Tree<unknown, unknown>> = []
      for (let index = 0; index < below.length; index++) {
        const child = node(below[index]!)
        if (child !== undefined) children.push(child)
      }
      if (skip && reduce === undefined && part.entries.length === 0 && children.length === 0) return undefined
      return {
        path: inst.path,
        entries: part.entries,
        children,
        reduce: reduce === undefined ? undefined : (below) => {
          const value = reduce(below)
          return own === fold ? value : { ...(below as object), ...(value as object) }
        },
        onError: (error) => onError(inst, error)
      }
    }
    const tree = node(root) ?? emptyTree
    const head = fold.merge(tree, options)
    return { head, title: fold.title(head) }
  }
  const failHead = (inst: Instance, error: unknown) => failInstance(inst, Cause.die(error), "head")
  /** The adoption head skips what throws, as the server does. The live fold is what fails the instance. */
  const skipHead = () => {}

  /**
   * Hydration: records the part of each instance in the subtree of one that waited, as it adopts: their
   * heads are evaluated now, over the state they adopted and the placement they had. One still waiting is
   * recorded when it adopts.
   */
  const recordAdopted = (inst: Instance) => {
    const parts = adoption
    if (parts === undefined) return
    const visit = (inst: Instance) => {
      if (parts.has(inst)) return
      const part = headPart(inst, skipHead)
      if (part === undefined) return
      parts.set(inst, part)
      for (const child of part.children) visit(child)
    }
    visit(inst)
  }
  /**
   * Once every instance has adopted, the head of the adopted state: `folded`, or the fold of the recorded
   * parts.
   */
  const settleAdoptionHead = (folded?: unknown) => {
    const parts = adoption
    if (parts === undefined || !adoptedDone || rootInstance === undefined) return
    adoption = undefined
    adoptionHead = folded !== undefined ? folded : foldTree(rootInstance, (inst) => parts.get(inst), skipHead).head
  }

  /**
   * Once every instance has adopted: the fetch-free window closes and `adopted` completes.
   */
  let reportPending = false
  const reportAdoption = () => {
    reportPending = false
    // The fetch-free window closes at adoption, unless a navigation closed it first.
    closeWindow()
    for (const f of adoptedWaiters.splice(0)) f()
  }

  const buildsPendingSince = (flush: number) => {
    let count = 0
    for (const stamp of building) if (stamp.flush >= flush) count++
    return count
  }

  /**
   * Folds the head once nothing is left to render, if a view changed. What throws in the fold fails
   * its instance: that fold saw the removed subtree, so it's discarded. A failed child leaves its parent
   * to render, so the drain renders the fallback and folds again. With the root failed nothing is left
   * to render, and the next fold here is final. Sibling conflicts go to `Query.Problems`, from the fold
   * that's kept.
   */
  const foldHead = () => {
    const root = rootInstance
    if (root === undefined) return
    while (viewChanged && dirty.size === 0 && deferred.length === 0) {
      viewChanged = false
      const conflicts: Array<Head.Conflict> = []
      const parts: Array<HeadPart> = []
      // A subtree where nothing declares a head folds to nothing, and this fold leaves such subtrees out,
      // so it's passed by without a walk of what it rendered. While hydration records each instance's part
      // every instance is read, as the record is of the tree as it was adopted.
      const prune = skipsEmpty && adoption === undefined
      const next = foldTree(
        root,
        (inst) => {
          let below = true
          if (prune) {
            const heads = inst.heads
            if (heads === 0) return undefined
            below = heads > (declaresHead(inst.component) ? 1 : 0)
          }
          const part = headPart(inst, failHead, below)
          if (part !== undefined && adoption !== undefined) parts.push(part)
          return part
        },
        failHead,
        { onConflict: (conflict) => conflicts.push(conflict) }
      )
      if (viewChanged || dirty.size > 0 || deferred.length > 0) continue
      merged = next.head
      mergedTitle = next.title
      headChanged = true
      for (const conflict of conflicts) report(conflict)
      if (adoption === undefined) continue
      // Without an instance that waited, the first kept fold is already the adopted state's.
      const first = adoption.size === 0
      for (const part of parts) if (!adoption.has(part.inst)) adoption.set(part.inst, part)
      settleAdoptionHead(first ? next.head : undefined)
    }
  }

  /** After the nodes commit: head sync, then the router's hook. Both wait until every instance has adopted. */
  const afterCommitHooks = () => {
    if (!adoptedDone) return
    if (headChanged) {
      headChanged = false
      if (ownsHead) host.head?.(merged)
    }
    // A head still to fold belongs to the flush already scheduled, which calls the hook.
    if (hooks !== undefined && handle !== undefined && !viewChanged) {
      hooks.afterFlush(handle, { flush: flushes, title: mergedTitle, buildsPendingSince })
    }
  }

  // -- failure --------------------------------------------------------------
  /** `f` is passed `inst`, so a call on a hot path needs no closure. */
  const guard = <A>(
    inst: Instance,
    where: MessageLog.FailedIn,
    f: (inst: Instance) => A,
    name?: string
  ): A | undefined => {
    try {
      return f(inst)
    } catch (error) {
      failInstance(inst, Cause.die(error), where, name)
      return undefined
    }
  }

  /**
   * Logs `Unmounted` for an instance leaving the tree and for everything under it, children first.
   * Called before the Scope closes: a close can be held open by a Command's cleanup long after the
   * path is free, and a new instance can mount there meanwhile.
   */
  const leave = (inst: Instance) => {
    if (inst.left) return
    inst.left = true
    inst.lazy = undefined
    if (declaresHead(inst.component)) {
      for (let at: Instance | undefined = inst; at !== undefined; at = at.parent) at.heads--
    }
    // At once, not when the Scope closes: the host may hand out a container's handle again.
    if (inst.parked !== undefined) {
      for (const container of inst.parked) unpark(inst, container)
    }
    // Its reports go with it.
    markReports(inst)
    for (const child of inst.children) leave(child)
    // An outlet is a place in its receiver's view, not an instance the log knows.
    if (inst.component !== outletComponent) record(inst, { _tag: "Unmounted" })
  }

  /**
   * Swaps what the instance rendered for an empty text node. `release` ends what was rendered once
   * the text node is in, and then the old nodes go, once.
   */
  const swapForPlaceholder = (inst: Instance, release: () => void) => {
    const nodes = inst.rendered.flatMap(nodesOf)
    const placeholder = host.createText("")
    const at = nodes[0]
    const parentNode = at === undefined ? undefined : host.parentOf(at)
    if (parentNode !== undefined) host.insertBefore(parentNode, placeholder, at)
    else if (inst.parent === undefined) host.insertBefore(container, placeholder, undefined)
    release()
    for (const node of nodes) host.remove(node)
    inst.rendered = [new TextRecord(emptyText, placeholder)]
  }

  /** Swaps the instance's nodes for an empty text node, closing its Scope. */
  const close = (inst: Instance) => {
    swapForPlaceholder(inst, () => {
      // Before the Scope closes: a Command's cleanup can hold the close open, and a fallback or
      // replacement created meanwhile must see the count without this instance's watchers.
      releaseWatches(inst)
      leave(inst)
      closeInstance(inst.parent, inst)
    })
    inst.parent?.children.delete(inst)
  }

  const failInstance = (
    inst: Instance,
    cause: Cause.Cause<unknown>,
    where: MessageLog.FailedIn,
    name?: string,
    update?: MessageLog.Failed["update"]
  ) => {
    if (inst.closed) return
    const failedSeq = record(inst, {
      _tag: "Failed",
      props: inst.props,
      in: where,
      name,
      cause,
      ...(update === undefined ? undefined : { update })
    })
    forkNow(
      ctx,
      Effect.logError(`${inst.path} failed in ${where}${name === undefined ? "" : ` (${name})`}`, cause)
    )
    inst.failure = cause
    // Nodes from the render that failed aren't given again.
    inst.lazy = undefined
    viewChanged = true
    close(inst)
    const parent = inst.parent
    if (parent === undefined) {
      showRootFallback(inst, cause)
      return
    }
    const onFailure = inst.onFailure
    if (onFailure !== undefined) {
      // The code of whoever declared the child, so a defect in it is theirs, and it runs between renders.
      const author = parent.author
      defer(() => {
        const message = guard(author, "onFailure", () => onFailure(AsyncResult.failure(cause)))
        if (message !== undefined) author.dispatch(message, { _tag: "Failure", path: inst.path, seq: failedSeq })
      })
    }
    markDirty(parent)
  }

  let rootFallbackNodes: Array<unknown> = []
  const showRootFallback = (root: Instance, cause: Cause.Cause<unknown>) => {
    const fallback = options?.fallback
    if (fallback === undefined) return
    try {
      const view = fallback(AsyncResult.failure(cause), View.makeHelper({}, root.component.elements()))
      const node = buildStatic(View.toNode(view))
      const placeholder = nodesOf(root.rendered[0]!)[0]
      host.insertBefore(
        container,
        node,
        placeholder !== undefined && host.parentOf(placeholder) === container ? placeholder : undefined
      )
      rootFallbackNodes.push(node)
    } catch (error) {
      record(root, { _tag: "Failed", props: root.props, in: "fallback", name: undefined, cause: Cause.die(error) })
    }
  }
  /** The root fallback runs with no instance: plain nodes, no handlers, no children. */
  const buildStatic = (view: View.Node<any, any>): unknown => {
    if (view._tag === "Text") return host.createText(view.text)
    if (view._tag === "Child" || view._tag === "Outlet") return host.createText("")
    const node = host.createElement(view.tag)
    for (const name in view.attrs) host.setAttr(node, name, view.attrs[name])
    for (const child of view.children) host.insertBefore(node, buildStatic(child), undefined)
    for (const name in view.props) host.setProp(node, name, view.props[name])
    return node
  }

  // -- shared Layers --------------------------------------------------------
  interface SharedBuild {
    readonly env: Env
    readonly scope: Scope.Closeable
    refs: number
    /** When the build began, counted with `builds`. */
    readonly stamp: number
  }

  /** What the runtime interrupts a running Layer build with when its Scope closes. */
  const buildInterrupter = -(++buildInterrupters)
  /**
   * Ends once every Scope close and every interrupted build's own cleanup has, the other waiters'
   * included. After a yield: the interrupt can arrive from inside the close that sent it, before that
   * close is tracked.
   */
  const buildsReleased = Effect.andThen(
    Effect.yieldNow,
    Effect.suspend(() => Fiber.awaitAll([...closing, ...releasedBuilds]))
  )
  /**
   * Builds `layer` in a Scope of its own under `scope`, which a failed build closes, so a memoised
   * Layer that failed is built again by its next user. With a `memoMap` the build shares it, else it
   * forks the context's.
   *
   * A build the runtime interrupts on release can be building a memoised Layer that others wait on,
   * and they end with its interrupt. A build that ends with only interrupts, that one among them,
   * starts again while `scope` is open, once the interrupted entries are gone and their resources
   * released. One still held makes the next attempt fail the same way, and try again. A Layer that
   * interrupts itself still fails.
   *
   * An attempt let go of still cleans up: one interrupted as its Scope closes in its fiber, a failed
   * one as its Scope closes. `scope` owns that cleanup: its close ends after it, so the services the
   * Layer used outlive it.
   */
  const buildLayer = (
    layer: Layer.Layer<any, any, any>,
    context: Context.Context<any>,
    memoMap: Layer.MemoMap | undefined,
    scope: Scope.Scope,
    onExit: (exit: Exit.Exit<Context.Context<any>, unknown>) => void
  ) => {
    const cleanups = new Set<Fiber.Fiber<unknown, unknown>>()
    addFinalizer(scope, awaitOthers(cleanups))
    const attempt = (again: boolean) => {
      const buildScope = Scope.forkUnsafe(scope, "sequential")
      const build = memoMap === undefined
        ? Layer.buildWithScope(layer, buildScope)
        : Layer.buildWithMemoMap(layer, memoMap, buildScope)
      // The wait is part of the build, so it ends with its Scope too.
      let waiting = again
      const fiber = forkNow(
        withCache(context),
        again
          ? Effect.andThen(
            buildsReleased,
            Effect.suspend(() => {
              waiting = false
              return build
            })
          )
          : build
      )
      const done = (exit: Exit.Exit<Context.Context<any>, unknown>) => {
        if (Exit.isSuccess(exit)) return onExit(exit)
        // Closing lets go of this attempt's memo entries, the interrupted ones included.
        const closed = closeScope(buildScope)
        if (closed !== undefined) track(cleanups, closed)
        // Released while it waited: nothing was being built, so nothing failed.
        if (waiting) return
        // A build released with `scope` was interrupted for itself: `scope` is closed by then.
        if (
          isClosed(scope) || !Cause.hasInterruptsOnly(exit.cause) ||
          !Cause.interruptors(exit.cause).has(buildInterrupter)
        ) return onExit(exit)
        attempt(true)
      }
      const exit = fiber.pollUnsafe()
      if (exit !== undefined) return done(exit)
      fiber.addObserver((exit) => step(() => done(exit)))
      // A build still running ends with its Scope.
      addFinalizer(
        buildScope,
        Effect.sync(() => {
          if (fiber.pollUnsafe() !== undefined) return
          // The interrupted Layer runs its own cleanup in the fiber, after this close has ended and
          // before `scope`'s does.
          track(releasedBuilds, fiber)
          track(cleanups, fiber)
          fiber.interruptUnsafe(buildInterrupter)
        })
      )
    }
    attempt(false)
  }

  /**
   * A Layer value is built once per (parent Env, Layer), and the last instance to let go closes it.
   * It's built with the parent Env's memo map, so the memoised Layers inside it are built once per
   * Env too, and closed when the last build using them is.
   */
  const acquireShared = (parentEnv: Env, layer: Layer.Layer<any, any, any>): SharedBuild => {
    let byLayer = sharedBuilds.get(parentEnv)
    if (byLayer === undefined) sharedBuilds.set(parentEnv, byLayer = new Map())
    const found = byLayer.get(layer)
    if (found !== undefined) {
      found.refs++
      return found
    }
    // Not owned by the first user's Scope: every user releases it, and the last one closes it.
    const entry: SharedBuild = {
      env: buildingEnv(parentEnv),
      scope: Scope.makeUnsafe("sequential"),
      refs: 1,
      stamp: ++builds
    }
    byLayer.set(layer, entry)
    whenReady(parentEnv, (parentCtx) => {
      buildLayer(layer, parentCtx, memoMapOf(parentEnv), entry.scope, (exit) => {
        if (Exit.isFailure(exit)) {
          // A failed build is evicted, so the next user builds again.
          if (byLayer!.get(layer) === entry) byLayer!.delete(layer)
          failEnv(entry.env, exit.cause)
        } else {
          resolveEnv(entry.env, Context.merge(parentCtx, exit.value))
        }
      })
    }, (cause) => failEnv(entry.env, cause))
    return entry
  }

  /** The last user's close ends once the build's has, so the parent's services outlive it. */
  const releaseShared = (
    parentEnv: Env,
    layer: Layer.Layer<any, any, any>,
    entry: SharedBuild
  ): Effect.Effect<void> => {
    if (--entry.refs > 0) return Effect.void
    const byLayer = sharedBuilds.get(parentEnv)
    if (byLayer?.get(layer) === entry) byLayer.delete(layer)
    return Scope.close(entry.scope, Exit.void)
  }

  /**
   * Builds an instance's own Layer into `own` under `scope`, once `parentEnv` is ready. A factory or a
   * key that throws is the Layer failing, not the parent's view. A build the instance has let go of,
   * because it closed or a keyed provide selected again, is not heard from.
   */
  const buildOwn = (
    inst: Instance,
    parentEnv: Env,
    own: Env,
    scope: Scope.Scope,
    layerOf: () => Layer.Layer<any, any, any>,
    ready: () => void,
    fail: (cause: Cause.Cause<unknown>) => void
  ) => {
    const current = () => !inst.closed && inst.env === own
    whenReady(parentEnv, (parentCtx) => {
      if (!current()) return
      let layer: Layer.Layer<any, any, any>
      try {
        layer = layerOf()
      } catch (defect) {
        return fail(Cause.die(defect))
      }
      buildLayer(layer, parentCtx, undefined, scope, (exit) => {
        if (!current()) return
        if (Exit.isFailure(exit)) return fail(exit.cause)
        ready()
        resolveEnv(own, Context.merge(parentCtx, exit.value))
      })
    }, fail)
  }

  /**
   * Counts `own` as building until it settles or `scope` closes. Returns what ends the count early,
   * as a build that failed without failing `own` does.
   */
  const countBuilding = (own: Env, scope: Scope.Scope): () => void => {
    // A build that begins between flushes belongs to the next one, which commits what began it.
    const stamp = { flush: rendering ? flushes : flushes + 1 }
    building.add(stamp)
    const settle = () => {
      if (!building.delete(stamp)) return
      // The router's settle condition is checked after a flush, so a settled build wakes one.
      if (hooks !== undefined) wake()
      checkIdle()
    }
    whenReady(own, settle, settle)
    addFinalizer(scope, Effect.sync(settle))
    return settle
  }

  /**
   * The instance's provided Layer failed once it was made. Unhandled, the instance fails. Handled, it
   * stays mounted and hears about it once: Feature children below show `fallback`, and Commands waiting
   * for the Layer are interrupted. The server ships the failure as the instance's status, and a client
   * that adopts the instance starts from it. Slots on both sides get `serverFailure`, not the cause. A
   * selection a keyed provide has replaced in the meantime is not heard from.
   */
  const ownFailed = (inst: Instance, own: Env, cause: Cause.Cause<unknown>, before?: () => void) => {
    const handle = inst.component.layerFailure
    if (handle === undefined) {
      defer(() => {
        before?.()
        if (inst.env === own) failInstance(inst, cause, "layer")
      })
      return
    }
    // The page ships the status without its cause: the server's slots render what the client's will.
    failEnv(own, cause, server !== undefined ? serverFailure() : cause)
    defer(() => {
      if (inst.env !== own) return
      const message = guard(inst, "onFailure", () => handle(AsyncResult.failure(cause)))
      if (message !== undefined) inst.dispatch(message, { _tag: "Dispatch" })
    })
  }

  // -- keyed provides ---------------------------------------------------------
  /** The selection whose read point is due: the instance had an update, or new props, since the last. */
  const dueSelection = (inst: Instance): Selection | undefined =>
    inst.selection?.due === true ? inst.selection : undefined
  /** The Env an instance's work runs against. After a handled Layer failure, the nearest with services. */
  const workEnv = (inst: Instance): Env => inst.env.failure !== undefined ? settled(inst.env) : inst.env
  /** Runs `go` once the instance's Layer is ready. After a handled failure, against the parent's services. */
  const againstEnv = (inst: Instance, go: (envCtx: Context.Context<any>) => void, failed?: () => void) =>
    whenReady(workEnv(inst), go, failed)
  /**
   * Starts a Subscription or a query once the instance's Layer is ready. After a handled failure it
   * runs against the parent's services, except under a keyed provide: there it was set up for the
   * selected services, and it waits for the next selection rather than fail the instance without them.
   */
  const startWatching = (inst: Instance, go: (envCtx: Context.Context<any>) => void) => {
    if (inst.env.failure === undefined || inst.selection === undefined) againstEnv(inst, go)
  }
  /** As `againstEnv`, now or once a due read of the keys has picked the Env it binds to. */
  const onceSelected = (inst: Instance, go: (envCtx: Context.Context<any>) => void, failed?: () => void) => {
    const due = dueSelection(inst)
    if (due !== undefined) due.held.push(() => againstEnv(inst, go, failed))
    else againstEnv(inst, go, failed)
  }

  /**
   * The read point of a keyed provide, before the view of an instance that had an update or new
   * props. Its keys are read only if its Model or props changed since the last read, so once per flush
   * however many updates it had. A change selects again. Either way, the runs issued since the last
   * read point then start, and a Subscription sync that waited for it runs.
   */
  const reselect = (inst: Instance) => {
    const selection = inst.selection
    if (selection === undefined || !selection.due) return
    selection.due = false
    let changed = false
    let unsettled = false
    if (inst.model !== selection.model || inst.props !== selection.props) {
      selection.model = inst.model
      selection.props = inst.props
      const keys = readKeys(inst.component, inst.props, inst.model)
      changed = !sameKeys(selection.keys, keys)
      if (changed) unsettled = swap(inst, selection, keys)
    }
    selection.issued.clear()
    const held = selection.held
    selection.held = []
    for (const f of held) f()
    // Built once the held runs wait for it, so a build that fails at once interrupts them too.
    if (changed) startSelection(inst, selection, inst.env, unsettled)
    if (!changed && !selection.skipped) return
    selection.skipped = false
    syncSubscriptions(inst)
    drainKeyed(inst)
  }

  /**
   * A keyed provide's key changed. The instance keeps its Model and gets a new Env, pending, so what
   * starts from now on waits for the new build. While the old services are still alive, its runs stop
   * and their results are dropped, its Subscriptions and queries stop, its results reset, and what it
   * rendered goes, descendants and mounts included. The runs issued since the last read are kept: they
   * run against the new services. The old selection is released once the new build settles; one
   * still building is interrupted now. The caller starts the new build. Returns whether the old one's
   * last Layer entry was a `LayerPending` or a `LayerFailed`.
   */
  const swap = (inst: Instance, selection: Selection, keys: Keys): boolean => {
    selection.keys = keys
    const previous = inst.env
    const own = buildingEnv(selection.parentEnv, undefined, rebuildingStatus)
    inst.env = own
    const waits: Array<Fiber.Fiber<unknown, unknown>> = []
    const stopped = inst.runs.filter((run) => !selection.issued.has(run))
    // Queued and awaiting runs first, so stopping a running one promotes only a kept run.
    for (const run of stopped) if (run.status !== "running") dropRun(inst, run)
    for (const run of stopped) if (!run.done) dropRun(inst, run)
    // The runs asked to stop whose fibers haven't exited, just now or in an earlier flush.
    for (const run of inst.runs) if (run.status === "stopping") waits.push(run.fiber!)
    stopSubscriptions(inst, waits)
    clearRendered(inst)
    // What still closes may use the old services, removed in an earlier flush or just now.
    if (inst.closes !== undefined) waits.push(...inst.closes)
    if (previous.ctx !== undefined && selection.retired === undefined) {
      selection.retired = { scope: selection.scope, waits }
    } else {
      // Still building, or failed: nothing in it is kept.
      releaseSelection(selection, { scope: selection.scope, waits: [] })
      selection.retired?.waits.push(...waits)
    }
    selection.scope = Scope.makeUnsafe("sequential")
    return previous.status._tag !== "Ready"
  }

  /**
   * Builds a selection made after mount, logged and counted as a build at mount is. `unsettled`: the
   * log's last Layer entry for the instance isn't a `LayerReady`, so one built at once, which logs no
   * `LayerPending`, still says it's ready.
   */
  const startSelection = (inst: Instance, selection: Selection, own: Env, unsettled: boolean) => {
    const keys = selection.keys
    const stamp = ++builds
    let pending = false
    let failed = false
    let settle: (() => void) | undefined
    const fail = (cause: Cause.Cause<unknown>) => {
      failed = true
      settle?.()
      lastFailedBuild = Math.max(lastFailedBuild, stamp)
      if (inst.closed || inst.env !== own) return
      record(inst, { _tag: "LayerFailed", cause })
      ownFailed(inst, own, cause)
    }
    const ready = () => {
      if (!inst.closed && (pending || unsettled)) record(inst, { _tag: "LayerReady" })
    }
    const release = () => releaseRetired(selection)
    whenReady(own, release, release)
    buildOwn(
      inst,
      selection.parentEnv,
      own,
      selection.scope,
      () => inst.component.layer!(inst.props, keysOrThrow(keys)),
      ready,
      fail
    )
    if (failed || own.ctx !== undefined || own.failure !== undefined) return
    pending = true
    record(inst, { _tag: "LayerPending", status: "Rebuilding" })
    settle = countBuilding(own, selection.scope)
  }

  /** Releases the selection kept while the current one built, once the work stopped against it has exited. */
  const releaseRetired = (selection: Selection) => {
    const retired = selection.retired
    if (retired === undefined) return
    selection.retired = undefined
    releaseSelection(selection, retired)
  }

  /** Waits for the work stopped against a selection to exit, then closes its Scope, to the end. */
  const releaseOf = ({ scope, waits }: Retired): Effect.Effect<void> =>
    Effect.andThen(Fiber.awaitAll(waits), Scope.close(scope, Exit.void))

  /**
   * Releases a selection the instance has let go of. Until the close has ended, its own cleanup
   * included, the release stays the instance's: the instance's close waits for it.
   */
  const releaseSelection = (selection: Selection, retired: Retired) => {
    const fiber = forkNow(ctx, releaseOf(retired), uninterruptibly)
    if (fiber.pollUnsafe() !== undefined) return
    track(closing, fiber)
    track(selection.releasing, fiber)
  }

  /**
   * The instance's Scope closing: the current selection is released, then the retired one once the
   * work stopped against it has exited, and the releases already running end, so a finalizer still
   * running never sees its services go, and the services above outlive every one of them.
   */
  const closeSelection = (selection: Selection): Effect.Effect<void> =>
    Effect.suspend(() => {
      const retired = selection.retired
      selection.retired = undefined
      return Effect.andThen(
        Scope.close(selection.scope, Exit.void),
        Effect.andThen(
          retired === undefined ? Effect.void : releaseOf(retired),
          Effect.suspend(() => Fiber.awaitAll([...selection.releasing]))
        )
      )
    })

  /** Stops a run whose selection went: an awaiting run's message is dropped rather than delivered. */
  const dropRun = (inst: Instance, run: Run) => {
    if (run.held === undefined) return stopRun(inst, run)
    endWait(run, "interrupt")
    run.held = undefined
    removeRun(inst, run)
    recordEnded(inst, run)
    markDirty(inst)
  }

  /** Stops the instance's Subscriptions and queries, and resets its results, for a new selection. */
  const stopSubscriptions = (inst: Instance, waits: Array<Fiber.Fiber<unknown, unknown>>) => {
    if (inst.subscriptions !== undefined) {
      for (const [key, running] of inst.subscriptions) {
        record(inst, { _tag: "SubscriptionStopped", key, name: running.name, deps: running.deps })
        if (running.fiber !== undefined) waits.push(running.fiber)
        closeUnder(inst, running.scope)
      }
      inst.subscriptions = undefined
    }
    if (inst.watches !== undefined) {
      for (const running of inst.watches.values()) {
        // Abandoned: a fetch it started that nothing else waits for is interrupted now, while the old
        // services are alive. A fetch another watcher, a `get` or a prefetch still needs runs on.
        releaseWatch(running, true)
      }
      inst.watches = undefined
    }
    inst.keyed = undefined
    // Restarted, not followed: a debounced query registers at once, as at mount.
    inst.watchesSynced = false
    releasePrefetch(inst)
    if (inst.loadMores !== undefined) {
      for (const cancel of inst.loadMores) cancel()
      inst.loadMores.clear()
    }
    const bound = queryCore.boundOf(inst.component)
    const results = inst.results
    inst.results = undefined
    if (bound === undefined || results === undefined) return
    for (const entry of bound.entries) {
      const result = bound.empty[entry.name]
      if (results[entry.name] !== result) {
        record(inst, { _tag: "QueryChanged", name: entry.name, result })
      }
    }
  }

  /** Swaps everything the instance rendered for an empty text node: its descendants and mounts end. */
  const clearRendered = (inst: Instance) => {
    if (inst.rendered.length === 0) return
    swapForPlaceholder(inst, () => {
      for (const rendered of inst.rendered) closeAll(inst, rendered)
    })
    viewChanged = true
  }

  // -- instances ------------------------------------------------------------
  /** Runs `update` for a message to `inst`, in a step of its own. */
  const dispatchTo = (inst: Instance, message: unknown, source: MessageLog.Source) =>
    step(() => {
      renderAbove(inst)
      if (inst.closed || inst.waiting || frozen) return
      const component = inst.component
      let next: ReturnType<typeof component.update>
      busy++
      try {
        next = component.update(inst.model, message as never, inst.props, inst.results)
      } catch (error) {
        // No `Update` is logged for it, so the failure carries the message.
        return failInstance(inst, Cause.die(error), "update", undefined, { message, source })
      } finally {
        busy--
      }
      if (next === undefined) return
      const bound = queryCore.boundOf(component)
      const entrySeq = record(inst, {
        _tag: "Update",
        source,
        message,
        props: inst.props,
        model: next.model,
        commands: next.commands,
        events: next.events,
        lists: next.lists ?? [],
        sends: next.sends ?? [],
        // What `update` saw in `$.queries`, so a replay from any surviving entry sees it too.
        ...(bound === undefined ? undefined : { queries: inst.results ?? bound.empty })
      })
      apply(inst, next, entrySeq, false)
    })

  /**
   * An instance's one bound function, which serves twice: the host calls it for an event on an element
   * the instance rendered, with the event's name, and the Scope that holds the instance's finalizer
   * calls it with an `Exit` as the instance closes. Bound, not a closure: one object for each instance.
   */
  function fireOn(
    this: Inst,
    event: string | Exit.Exit<unknown, unknown>,
    handler?: unknown,
    payload?: unknown,
    onMessage?: (() => void) | undefined
  ): Effect.Effect<void> | undefined {
    if (typeof event !== "string") return this.finalize()
    if (this.closed || this.waiting) return
    const message = typeof handler === "function"
      ? guard(this, "domEvent", () => (handler as (payload: unknown) => unknown)(payload), event)
      : handler
    if (message === undefined) return
    // Before the message is sent, so the host can still act on its event.
    onMessage?.()
    this.dispatch(message, { _tag: "DomEvent", name: event })
  }

  /**
   * The instance's finalizer. Descendants, Subscriptions and mounts use child Scopes forked later, so
   * they close first. Then Commands stop, and the close waits for them to exit. One finalizer, run as
   * the Scope closes: a Scope that holds nothing else needs no Map, and a close with no run to wait
   * for ends without a fiber.
   */
  const finishInstance = (inst: Instance): Effect.Effect<void> => {
    // However the instance goes, a removed ancestor and failure included, its owners forget it.
    if (inst.owners !== undefined) { for (const owner of inst.owners.values()) owner.readers?.delete(inst) }
    const waits = stopRuns(inst)
    if (waits.length === 0) {
      unmounted(inst)
      return Effect.void
    }
    return Effect.andThen(awaitRuns(waits), Effect.sync(() => unmounted(inst)))
  }

  /** Adds the instance's finalizer to its Scope. */
  const addInstanceFinalizer = (inst: Instance) => (inst as Inst).hold()

  /**
   * Stops an instance's runs as it closes, and returns what the close waits for: every run fiber,
   * those stopped earlier and still stopping included. An awaiting run's message is dropped.
   */
  const stopRuns = (inst: Instance): Array<Effect.Effect<void>> =>
    inst.runs.length === 0 ? [] : inst.runs.slice().map((run) => stopAndAwait(inst, run))

  const unmounted = (inst: Instance) => {
    dirty.delete(inst)
    recorded.delete(inst)
    inst.watched = undefined
    // Both normally done already by whoever closed the Scope.
    releaseWatches(inst)
    leave(inst)
    // A child that closes while it waits no longer holds up adoption.
    if (inst.waiting) {
      inst.waiting = false
      settleWaiting()
    }
  }

  /** The fields of an instance that most instances never set. */
  class Rare {
    owning: Owning | undefined = undefined
    selection: Instance["selection"] = undefined
    parked: Instance["parked"] = undefined
    closes: Instance["closes"] = undefined
    subscriptions: Instance["subscriptions"] = undefined
    watches: Instance["watches"] = undefined
    watchesSynced: Instance["watchesSynced"] = false
    watched: Instance["watched"] = undefined
    prefetch: Instance["prefetch"] = undefined
    keyed: Instance["keyed"] = undefined
    keyedQueued: Instance["keyedQueued"] = false
    loadMores: Instance["loadMores"] = undefined
    mounting: Instance["mounting"] = undefined
    outbox: Instance["outbox"] = emptyList
    shares: Instance["shares"] = undefined
    readers: Instance["readers"] = undefined
    owners: Instance["owners"] = undefined
    seen: Instance["seen"] = undefined
    clash: Instance["clash"] = undefined
    deferred: Instance["deferred"] = false
    lazy: Instance["lazy"] = undefined
    heads: Instance["heads"] = 0
  }

  /**
   * An instance: one shape for every instance, so V8 keeps it in fast mode. The fields a feature
   * needs are `undefined` until the feature first does, and collections start out shared and empty.
   */
  class Inst implements Instance {
    /** The fields most instances never set, made when one is first set. */
    rare: Rare | undefined = undefined
    readonly born = ++instancesMade
    author: Instance
    content: ((parts: any) => View.Content<any, any>) | undefined
    env: Env
    children: Set<Instance> = noChildren
    props: unknown
    model: unknown = undefined
    results: componentQueries.Results | undefined = undefined
    onEmit: (events: unknown) => unknown
    onFailure: ((failure: AsyncResult.Failure<never, unknown>) => unknown) | undefined
    failure: Cause.Cause<unknown> | undefined = undefined
    childPaths: ChildPaths | undefined = undefined
    rendered: Array<Rendered> = emptyList
    waiting = false
    adoptsChildren = false
    runs: Array<Run> = emptyList
    left = false
    cause: number | undefined = undefined
    /** The instance's event dispatch and finalizer: see `fireOn`. */
    private fired: OmitThisParameter<typeof fireOn> | undefined = undefined
    /**
     * The instance's Scope, made when it's first asked for. Until then the instance's finalizer, `held`,
     * is registered in its parent's Scope: most instances fork nothing and start no work.
     */
    private own: Scope.Closeable | undefined
    /** Whether its finalizer waits in its parent's Scope. */
    private held = false
    /** Closed before it had a Scope of its own. */
    private dead = false
    /** Its path once made: a root's, a feature's or a headless instance's at once, others' when asked for. */
    private named: string | undefined
    /** The key of the child it was declared as, which its path ends with. */
    readonly key: string
    readonly depth: number
    readonly component: Component.Any
    readonly parent: Instance | undefined
    readonly owner: View.Owner | undefined
    constructor(
      named: string | undefined,
      key: string,
      depth: number,
      component: Component.Any,
      parent: Instance | undefined,
      owner: View.Owner | undefined,
      scope: Scope.Closeable | undefined,
      env: Env,
      props: unknown,
      onEmit: (events: unknown) => unknown,
      onFailure: ((failure: AsyncResult.Failure<never, unknown>) => unknown) | undefined,
      content: ((parts: any) => View.Content<any, any>) | undefined,
      author: Instance | undefined
    ) {
      this.named = named
      this.key = key
      this.depth = depth
      this.component = component
      this.parent = parent
      this.owner = owner
      this.own = scope
      this.author = author ?? this
      this.content = content
      this.env = env
      this.props = props
      this.onEmit = onEmit
      this.onFailure = onFailure
      if (component.definition.shares !== undefined) {
        ;(this.rare = new Rare()).owning = { seq: -1, round: false, collected: undefined, restored: false }
      }
    }
    /**
     * Made the first time it's asked for, from its parent's path and its own segment: most instances
     * are never asked, and a string for each row would outweigh the row's other fields.
     */
    get path(): string {
      return this.named ??= this.parent!.path + "/" + segmentOf(this.component, this.key)
    }
    // The rare fields, read from and written to `rare` by the accessors defined below the class.
    declare readonly owning: Owning | undefined
    declare selection: Instance["selection"]
    declare parked: Instance["parked"]
    declare closes: Instance["closes"]
    declare subscriptions: Instance["subscriptions"]
    declare watches: Instance["watches"]
    declare watchesSynced: Instance["watchesSynced"]
    declare watched: Instance["watched"]
    declare prefetch: Instance["prefetch"]
    declare keyed: Instance["keyed"]
    declare keyedQueued: Instance["keyedQueued"]
    declare loadMores: Instance["loadMores"]
    declare mounting: Instance["mounting"]
    declare outbox: Instance["outbox"]
    declare shares: Instance["shares"]
    declare readers: Instance["readers"]
    declare owners: Instance["owners"]
    declare seen: Instance["seen"]
    declare clash: Instance["clash"]
    declare deferred: Instance["deferred"]
    declare lazy: Instance["lazy"]
    declare heads: Instance["heads"]
    /**
     * From the moment its Scope or an ancestor's starts closing, not once it has: see `Instance.closed`.
     */
    get closed(): boolean {
      const own = this.own
      return (own === undefined ? this.dead : isClosed(own)) || this.parent?.closed === true
    }
    get scope(): Scope.Closeable {
      let own = this.own
      if (own !== undefined) return own
      if (this.dead) {
        own = Scope.makeUnsafe("sequential")
        Scope.closeUnsafe(own, Exit.void)
      } else {
        const under = this.parent!.scope
        if (this.held && under.state._tag === "Open") {
          // It takes the slot its finalizer held in the parent, so it closes among its siblings where
          // one forked when the instance was made would: a late Scope doesn't make it close first. Its
          // finalizer moves into it. `close` frees the slot.
          this.held = false
          own = Scope.makeUnsafe("sequential")
          scopeAddFinalizerUnsafe(own, this, this.bound())
          const scope = own
          scopeAddFinalizerUnsafe(under, this, (exit) => Scope.close(scope, exit))
        } else {
          own = Scope.forkUnsafe(under, "sequential")
        }
      }
      return this.own = own
    }
    /** Adds the instance's finalizer: to its Scope, or to its parent's until it has one. */
    hold(): void {
      const own = this.own
      const under = own ?? this.parent!.scope
      if (under.state._tag === "Closed") {
        if (own === undefined) this.dead = true
        track(closing, forkNow(ctx, Effect.suspend(() => finishInstance(this))))
        return
      }
      if (own === undefined) this.held = true
      scopeAddFinalizerUnsafe(under, this, this.bound())
    }
    /** Run by the Scope that holds the instance's finalizer. */
    finalize(): Effect.Effect<void> {
      if (this.held) {
        this.held = false
        this.dead = true
      }
      return finishInstance(this)
    }
    /** Closes the instance's Scope, or runs its finalizer when it has none. What's left of the close. */
    close(): Effect.Effect<void> | undefined {
      const own = this.own
      if (own !== undefined) {
        // A Scope made late sits in its finalizer's slot in the parent's, which closing it doesn't free.
        const under = (this.parent as Inst | undefined)?.own
        if (under !== undefined) scopeRemoveFinalizerUnsafe(under, this)
        return Scope.closeUnsafe(own, Exit.void) as Effect.Effect<void> | undefined
      }
      if (this.dead) return undefined
      this.dead = true
      if (!this.held) return undefined
      this.held = false
      scopeRemoveFinalizerUnsafe(this.parent!.scope, this)
      try {
        return finishInstance(this)
      } catch (defect) {
        return Effect.die(defect)
      }
    }
    /** An outlet's messages go to the author of its content. */
    dispatch(message: unknown, source: MessageLog.Source): void {
      if (this.component === outletComponent) this.author.dispatch(message, source)
      else dispatchTo(this, message, source)
    }
    get fire(): Renderer.Dispatch {
      return this.component === outletComponent ? this.author.fire : (this.fired ??= fireOn.bind(this))
    }
    /** What the Scope that holds the instance's finalizer calls. */
    private bound(): (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void> {
      return (this.fired ??= fireOn.bind(this)) as (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void>
    }
  }

  for (const name of Object.keys(new Rare()) as Array<keyof Rare>) {
    const empty = new Rare()[name]
    Object.defineProperty(Inst.prototype, name, {
      get(this: { rare: Rare | undefined }) {
        const rare = this.rare
        return rare === undefined ? empty : rare[name]
      },
      set(this: { rare: Rare | undefined }, value: unknown) {
        if (this.rare === undefined) {
          if (value === empty) return
          this.rare = new Rare()
        }
        ;(this.rare as any)[name] = value
      }
    })
  }

  const makeInstance = (
    component: Component.Any,
    props: unknown,
    named: string | undefined,
    key: string,
    parent: Instance | undefined,
    parentEnv: Env,
    onEmit: (events: unknown) => unknown,
    onFailure: ((failure: AsyncResult.Failure<never, unknown>) => unknown) | undefined,
    range: Range | undefined,
    content?: ((parts: any) => View.Content<any, any>) | undefined,
    slots?: Slotted["values"]
  ): Instance => {
    // A child's Scope is made when it's needed: see `Inst.scope`.
    const ownScope = parent === undefined ? Scope.forkUnsafe(rootScope, "sequential") : undefined
    const depth = parent === undefined ? 0 : parent.depth + 1
    // Hydration reads state by path, and a headless instance's parts derive ids from it: made here then.
    const path = named === undefined && (hydrating !== undefined || content !== undefined)
      ? parent!.path + "/" + segmentOf(component, key)
      : named
    const owner: View.Owner | undefined = content === undefined ? undefined : { path: path!, depth }
    const inst: Instance = new Inst(
      content === undefined ? named : path,
      key,
      depth,
      component,
      parent,
      owner,
      ownScope,
      parentEnv,
      props,
      onEmit,
      onFailure,
      content,
      owner === undefined || parent === undefined ? undefined : parent.author
    )
    addInstanceFinalizer(inst)
    if (declaresHead(component)) {
      for (let at: Instance | undefined = inst; at !== undefined; at = at.parent) {
        at.heads++
      }
    }
    // `parentEnv` is the Env at the child node, but for a feature's implementation, which is passed no slots.
    if (component.definition.slots.length > 0) slottedBy.set(inst, { values: slots, env: parentEnv, placed: new Map() })
    if (owner !== undefined) owners.set(owner, inst)
    if (recording > 0) {
      inst.watched = new Set()
      recorded.add(inst)
    }

    // Hydration: the Model and query results the server rendered this path with, unless it deferred the path.
    const fromServer: Adopted = hydrating !== undefined &&
        (parent === undefined || parent.adoptsChildren) &&
        !hydrating.deferred.has(path!) &&
        Object.hasOwn(hydrating.state, path!)
      ? stateCodecOf(component).decode(hydrating.state[path!])
      : Option.none()
    // An owner adopting the server's Model starts from what its reports last sent there.
    const collectedOnServer = Option.isSome(fromServer) && component.definition.collects !== undefined
      ? Option.flatMap(
        Option.fromUndefinedOr(hydrating!.state["~reported"]?.[path!]),
        jsonCodecOf(component.definition.message).decode
      )
      : Option.none()

    // No closure is made here: an instance without a Layer, most of them, starts without one.
    let layer: LayerStart | undefined
    let selected: Start | undefined
    // A provided Layer builds in the background. The instance renders at once; its Commands,
    // Subscriptions and mounts, and its descendants', wait for it.
    if (component.layer !== undefined) {
      if (server !== undefined && (!component.layerOnServer || parentEnv.never)) {
        // Kept off the server: never built, and the budget doesn't wait for it. The client builds it fresh.
        inst.env = buildingEnv(parentEnv, true)
        inst.deferred = true
      } else {
        layer = new LayerStart(inst, range, fromServer)
        selected = startLayer(inst, layer, parentEnv, fromServer)
      }
    }
    if (layer === undefined) {
      begin(inst, range, fromServer, undefined, collectedOnServer, undefined)
      return inst
    }

    if (layer.failedEarly !== undefined) {
      layer.constructing = false
      layer.logEarly()
      failInstance(inst, layer.failedEarly, "layer")
      return inst
    }

    // Hydration: an instance the server rendered with its services, whose provided Layer is still
    // building here, keeps the server's nodes, inert, and adopts them once the Layer is ready: its status
    // is `Awaiting`. If the Layer fails and the component handles it, the instance is built fresh and gets
    // its failure message. One the server rendered while its Layer was pending adopts at once, as its
    // feature slots showed their fallbacks there too.
    if (layer.awaits && layer.pending && Option.isSome(fromServer)) {
      awaitLayer(inst, layer, range!, fromServer, collectedOnServer)
    } else begin(inst, range, fromServer, selected, collectedOnServer, layer)
    layer.constructing = false
    return inst
  }

  /**
   * A provided Layer's part in an instance's start. Its entries wait until the instance's first entry,
   * `Mounted` or `Waiting`, is logged. A failure while the instance is still being made fails it once
   * it's made.
   */
  class LayerStart {
    readonly inst: Instance
    /** The server rendered the instance with its services: if its Layer is still building here, it waits. */
    readonly awaits: boolean
    /** The status the server recorded for the instance's provide, when it wasn't ready there. */
    readonly shipped: Shipped | undefined
    buffering = true
    readonly early: Array<() => void> = []
    constructing = true
    failedEarly: Cause.Cause<unknown> | undefined = undefined
    pending = false
    constructor(inst: Instance, range: Range | undefined, fromServer: Adopted) {
      this.inst = inst
      this.shipped = Option.isSome(fromServer) ? shippedStatus(inst.path) : undefined
      this.awaits = range !== undefined && Option.isSome(fromServer) && this.shipped === undefined
    }
    lifecycle(draft: Draft) {
      if (this.buffering) this.early.push(() => record(this.inst, draft))
      else record(this.inst, draft)
    }
    readonly logEarly = () => {
      this.buffering = false
      for (const f of this.early.splice(0)) f()
    }
  }

  /**
   * Starts building an instance's provided Layer. Returns what a keyed provide selected from, which
   * `begin` takes, so `init` runs once.
   */
  const startLayer = (
    inst: Instance,
    layer: LayerStart,
    parentEnv: Env,
    fromServer: Adopted
  ): Start | undefined => {
    const component = inst.component
    const props = inst.props
    let selected: Start | undefined
    // A keyed provide selects from the Model the instance starts with: the server's when it
    // hydrates, else history's or `init`'s. Each selection builds in a Scope of its own.
    let keys: Keys = none
    let buildScope: Scope.Closeable | undefined
    if (component.layerKeys !== undefined) {
      let model: unknown
      if (Option.isSome(fromServer)) model = fromServer.value.model
      else {
        const { adopted, first } = selected = startFrom(inst, fromServer)
        model = Option.isSome(adopted) ? adopted.value.model : first?.model
      }
      keys = readKeys(component, props, model)
      if (server !== undefined) {
        // The server builds once, from the Model it starts with.
        buildScope = Scope.forkUnsafe(inst.scope, "sequential")
      } else {
        buildScope = Scope.makeUnsafe("sequential")
        const selection: Selection = {
          parentEnv,
          keys,
          model,
          props,
          due: false,
          scope: buildScope,
          retired: undefined,
          releasing: new Set(),
          issued: new Set(),
          held: [],
          skipped: false
        }
        inst.selection = selection
        // Added before the instance's runs and Subscriptions start, so it closes after them.
        addFinalizer(inst.scope, closeSelection(selection))
      }
    }
    // Forked now, before the run-stop finalizer below, so a build that waits for its parent's Env
    // still closes after the instance's runs.
    buildScope ??= Scope.forkUnsafe(inst.scope, "sequential")
    const sharedLayer = component.sharedLayer
    // Failed on the server: the client adopts the failure, which the Model already handled, and builds nothing.
    const adoptsFailure = layer.shipped === "Failed"
    const shared = sharedLayer !== undefined && !adoptsFailure ? acquireShared(parentEnv, sharedLayer) : undefined
    const own = shared !== undefined ? shared.env : buildingEnv(parentEnv)
    inst.env = own
    if (shared !== undefined) {
      addFinalizer(inst.scope, Effect.suspend(() => releaseShared(parentEnv, sharedLayer!, shared)))
    }
    let settleBuild: (() => void) | undefined
    const buildStamp = shared !== undefined ? shared.stamp : ++builds
    const fail = (cause: Cause.Cause<unknown>) => {
      settleBuild?.()
      lastFailedBuild = Math.max(lastFailedBuild, buildStamp)
      // `init` failed, or a keyed provide has selected again since.
      if (inst.closed || inst.env !== own) return
      // A handled failure on the server: its slots get `serverFailure`, not `cause`. See `ownFailed`.
      const redacted = server !== undefined && component.layerFailure !== undefined
      layer.lifecycle({ _tag: "LayerFailed", cause, ...(redacted ? { redacted } : undefined) })
      if (component.layerFailure === undefined && layer.constructing) layer.failedEarly = cause
      else ownFailed(inst, own, cause, layer.logEarly)
    }
    const ready = () => {
      if (!inst.closed && layer.pending) layer.lifecycle({ _tag: "LayerReady" })
    }
    if (inst.closed) {
      // `init` failed before a keyed provide could select: nothing is built.
    } else if (adoptsFailure) {
      // The slots get the substitute the server's did: a replay of this log renders it, not its JSON form.
      const cause = serverFailure()
      layer.lifecycle({ _tag: "LayerFailed", cause, redacted: true })
      failEnv(own, cause)
    } else if (shared !== undefined) {
      whenReady(own, ready, fail)
    } else {
      buildOwn(inst, parentEnv, own, buildScope, () => component.layer!(props, keysOrThrow(keys)), ready, fail)
    }
    if (!inst.closed && own.ctx === undefined && own.failure === undefined && layer.failedEarly === undefined) {
      layer.pending = true
      if (layer.awaits) own.status = awaitingStatus
      layer.lifecycle({ _tag: "LayerPending", status: layer.awaits ? "Awaiting" : "Pending" })
      settleBuild = countBuilding(own, buildScope)
    }
    // Added after the Layer's Scopes, which all exist by now, so the close stops the instance's runs
    // and waits for their cleanup before the services they use are released.
    addFinalizer(inst.scope, Effect.suspend(() => awaitRuns(stopRuns(inst))))
    return selected
  }

  /** What an instance starts from: `init`'s result, and the Model it adopts instead of `init`'s. */
  interface Start {
    readonly first: Component.Next<any, any, any, any> | undefined
    readonly adopted: Adopted
  }
  /** Runs `init`, once the host is known to show the component's elements. */
  const initOf = (inst: Instance): Component.Next<any, any, any, any> => {
    const component = inst.component
    const elements = component.elements()
    if (elements !== undefined && host.elements !== "any" && !host.elements.includes(elements.name)) {
      throw new Error(
        `${component.definition.name} renders ${elements.name} elements, and this host shows ${
          host.elements.join(", ")
        }`
      )
    }
    findOwners(inst)
    return component.init(inst.props)
  }
  /**
   * What the instance starts from: `init`'s result, and the Model it adopts from the server or from
   * history restore instead of `init`'s.
   */
  const startFrom = (inst: Instance, serverModel: Adopted): Start => {
    const first = guard(inst, "init", initOf)
    const component = inst.component
    let adopted = serverModel
    // An owner of shared state isn't restored from history: a reload would reopen what nobody hovers.
    if (
      first !== undefined && Option.isNone(adopted) && hooks !== undefined &&
      component.definition.shares === undefined
    ) {
      const restored = hooks.restore(inst.path)
      if (restored !== undefined) {
        adopted = Option.map(
          stateCodecOf(component).decode(restored),
          (state) => ({ model: state.model, results: restoreQueries(component, state.results) })
        )
      }
    }
    return { first, adopted }
  }

  /**
   * Runs `init` and renders. An instance adopting a Model (from the server, or from
   * history restore) replays `init` only for its Commands, every one of them: the adopted
   * Model wins and events are dropped. Given the server's nodes, it adopts them when its
   * view matches, and otherwise builds fresh. `selected` is what a keyed provide already read.
   */
  const begin = (
    inst: Instance,
    range: Range | undefined,
    serverModel: Adopted,
    selected: Start | undefined,
    collectedOnServer: Option.Option<unknown>,
    layer: LayerStart | undefined
  ) => {
    const { adopted, first } = selected ?? startFrom(inst, serverModel)
    const bound = queryCore.boundOf(inst.component)
    let mountedSeq = -1
    if (first !== undefined) {
      inst.model = Option.isSome(adopted) ? adopted.value.model : first.model
      inst.results = Option.isSome(adopted) ? adopted.value.results : undefined
      inst.adoptsChildren = Option.isSome(serverModel)
      if (Option.isSome(serverModel) && Option.isSome(collectedOnServer)) {
        inst.owning!.collected = { message: collectedOnServer.value }
        inst.owning!.restored = true
        // Compared once the pass settles and nothing below waits to adopt, readers or none: one that reported
        // on the server may not mount here.
        dueReports(inst)
      }
      if (log.enabled) {
        mountedSeq = record(inst, {
          _tag: "Mounted",
          props: inst.props,
          model: inst.model,
          // Restored or hydrated results, so a replay of the log starts from them.
          ...(bound === undefined ? undefined : { queries: inst.results ?? bound.empty }),
          commands: first.commands,
          events: first.events,
          adopted: Option.isSome(adopted)
        })
      }
    }
    layer?.logEarly()
    if (first === undefined) return
    // Before any child mounts: the readers below read it as they render.
    if (!refreshShares(inst, mountedSeq)) return
    // The first emission of each watch is written as its result before the first render, parent before
    // child, so a new instance over a warm entry never commits "Loading". An instance adopting the
    // server's state renders it first, to match the server's nodes, and gets the emissions after.
    let early: Instance["mounting"]
    if (Option.isNone(serverModel) && bound !== undefined) {
      inst.mounting = early = []
      syncSubscriptions(inst, true)
      // The keyed queries' first values, and whatever their `onChange` causes, before the first view.
      drainKeyed(inst)
      inst.mounting = undefined
      if (inst.closed || inst.failure !== undefined) return
    }
    // The updates folded before the first view may have changed a keyed provide's key.
    reselect(inst)
    if (inst.closed) return
    const tree = viewOf(inst)
    if (tree === undefined) return
    let taken: Rendered | undefined
    let rendered: Rendered
    try {
      if (range !== undefined && Option.isSome(serverModel)) {
        taken = adoptNode(inst, tree, host.nextOf(range.open), range.close, inst.env)
      }
      rendered = taken ?? create(inst, tree, inst.env)
      throwClash(inst)
    } catch (error) {
      failInstance(inst, Cause.die(error), "view")
      return
    }
    if (taken !== undefined) claim(range!)
    inst.rendered = [rendered]
    viewChanged = true
    if (inst.failure !== undefined) return
    if (Option.isSome(adopted)) {
      apply(inst, { model: inst.model, commands: none, events: none }, mountedSeq, true)
      const commands = first.commands
      for (let index = 0; index < commands.length; index++) {
        issue(inst, commands[index], { seq: mountedSeq, index }, index)
      }
    } else apply(inst, inst.model === first.model ? first : { ...first, model: inst.model }, mountedSeq, true)
    // The Commands of the updates folded before the render: issued where `init`'s are, after them.
    if (early !== undefined) {
      for (const entry of early) issue(inst, entry.command, entry.issued, undefined)
    }
  }

  /**
   * Keeps the server's nodes of an instance whose Layer is still building, and adopts them once it's
   * ready. See `makeInstance`.
   */
  const awaitLayer = (
    inst: Instance,
    layer: LayerStart,
    range: Range,
    fromServer: Option.Some<{ readonly model: unknown; readonly results: componentQueries.Results | undefined }>,
    collectedOnServer: Option.Option<unknown>
  ) => {
    const bound = queryCore.boundOf(inst.component)
    // Its first entry: `Mounted` comes when the Layer is ready, and the Layer's entries come as they happen.
    record(inst, {
      _tag: "Waiting",
      props: inst.props,
      model: fromServer.value.model,
      ...(bound === undefined ? undefined : { queries: fromServer.value.results ?? bound.empty })
    })
    layer.logEarly()
    inst.waiting = true
    waiting++
    range.claimed = true
    inst.rendered = rangeNodes(range).map((node) => new TextRecord(emptyText, node))
    const resume = (adopt: boolean) => {
      if (inst.closed || !inst.waiting) return
      inst.waiting = false
      const nodes = inst.rendered.flatMap(nodesOf)
      inst.rendered = []
      range.claimed = false
      // Where its nodes go. Read before it renders: adopting removes the markers.
      const parentNode = host.parentOf(range.open)
      const after = host.nextOf(range.close)
      // The placement its parent rendered while it waited: it adopts with the one it was placed with, the
      // server's, and its subtree's head is recorded from that. The latest comes after. Built fresh, it
      // starts from the latest.
      const held = heldPlacement.get(inst)
      heldPlacement.delete(inst)
      if (held !== undefined && !adopt) {
        inst.props = held.props
        setPlacement(inst, held)
      }
      begin(inst, range, adopt ? fromServer : Option.none(), undefined, collectedOnServer, layer)
      // Rebuilt: the server's nodes go. Adopted, the ones it kept are in place, and what it built fresh for
      // the rest isn't in the document yet. Nothing above it renders now, so it places its own nodes.
      if (!range.claimed) { for (const node of nodes) host.remove(node) }
      if (inst.failure === undefined && parentNode !== undefined) placeEach(parentNode, inst.rendered, after)
      if (adopt) recordAdopted(inst)
      if (held !== undefined && adopt && !inst.closed && inst.failure === undefined) applyPlacement(inst, held)
      viewChanged = true
      settleWaiting()
    }
    whenReady(inst.env, () => defer(() => resume(true)), () => {
      if (inst.component.layerFailure !== undefined) defer(() => resume(false))
    })
  }

  const apply = (inst: Instance, next: Component.Next<any, any, any, any>, entrySeq: number, initial: boolean) => {
    inst.model = next.model
    if (!refreshShares(inst, entrySeq)) return
    // Before its Commands are issued, so they wait for the read, even when the Model is unchanged.
    if (!initial && inst.selection !== undefined) inst.selection.due = true
    const mounting = inst.mounting
    if (mounting !== undefined) {
      // Before the first render: nothing is issued or marked dirty, and only the watches follow the Model.
      const commands = next.commands
      for (let index = 0; index < commands.length; index++) {
        mounting.push({ command: commands[index], issued: { seq: entrySeq, index } })
      }
      // The first render, which makes the children, comes first.
      if (queueSends(inst, next, entrySeq)) defer(() => deliverSends(inst))
      syncSubscriptions(inst, true)
      if (next.sends !== undefined && next.sends.length > 0) defer(() => sendToOwners(inst, next.sends!, entrySeq))
      if (next.events.length > 0) defer(() => deliverEvents(inst, next.events, entrySeq))
      return
    }
    const commands = next.commands
    for (let index = 0; index < commands.length; index++) {
      issue(inst, commands[index], { seq: entrySeq, index }, initial ? index : undefined)
    }
    if (!initial) markDirty(inst)
    // Delivered at the end of the render just marked, so a child it mounts can receive them.
    queueSends(inst, next, entrySeq)
    syncSubscriptions(inst)
    // After the watches follow the Model, so a load more reaches the args the query returns for it.
    if (!initial && next.lists !== undefined) {
      for (const list of next.lists) issueList(inst, list)
    }
    // Synchronous, as emits are: the owner's `update` applies before this one's emits are delivered.
    if (next.sends !== undefined && next.sends.length > 0) sendToOwners(inst, next.sends, entrySeq)
    if (next.events.length === 0) return
    // An emit from `init` waits until the parent, which is still being built, has its first Model.
    if (initial) defer(() => deliverEvents(inst, next.events, entrySeq))
    else deliverEvents(inst, next.events, entrySeq)
  }
  /**
   * A `$.loadMore` or `$.reset`: the args come from the infinite query. A disabled query does nothing,
   * and on the server both are dropped and reported, as a Command is.
   */
  const issueList = (inst: Instance, list: Component.ListIssue) => {
    if (inst.closed) return
    const bound = queryCore.boundOf(inst.component)
    const field = bound?.byName.get(list.name)
    if (bound === undefined || field === undefined || !field.list) return
    const args = bound.context(inst.model, inst.props, inst.results).argsOf(field.name).args
    if (args === undefined) return
    const call = `$.${list.op}(${JSON.stringify(list.name)})`
    if (server !== undefined) {
      report(
        new Command.ServerCommandIssued({
          path: inst.path,
          command: call,
          message:
            `[@effect/ui] ${inst.path}'s update issued ${call} during server rendering, and it was dropped. The server renders a list's first page only.`
        })
      )
      return
    }
    const def = queryModule().defOf(field.query)
    if (list.op === "reset") return queryCache().reset(def, args)
    const go = (envCtx: Context.Context<any>) => {
      if (inst.closed) return
      const fetcher = Context.getOption(envCtx, field.query as any)
      // The watch reports a `Query` nothing provides.
      if (Option.isNone(fetcher)) return
      let cancel: (() => void) | undefined
      let done = false
      cancel = queryCache().loadMore(def, args, fetcher.value as any, () => {
        done = true
        if (cancel !== undefined) inst.loadMores?.delete(cancel)
      })
      if (!done) {
        holdsWatchers = true
        ;(inst.loadMores ??= new Set()).add(cancel)
      }
    }
    onceSelected(inst, go)
  }
  const queueSends = (inst: Instance, next: Component.Next<any, any, any, any>, entrySeq: number): boolean => {
    if (next.sends === undefined || next.sends.length === 0) return false
    let queued = false
    next.sends.forEach((send, index) => {
      if (send.ref === undefined) return
      if (inst.outbox === emptyList) inst.outbox = []
      inst.outbox.push({ send, issued: { seq: entrySeq, index } })
      queued = true
    })
    return queued
  }
  /**
   * Counts one more round of sends by `inst` in this flush, and fails it past the limit: a parent and
   * a child, or a reader and its owner, whose updates answer each other would never leave `drainLoop`.
   */
  const countSends = (inst: Instance, to: string): boolean => {
    const passes = (sendPasses.get(inst) ?? 0) + 1
    sendPasses.set(inst, passes)
    if (passes <= maxSendPasses) return true
    const error = new Error(
      `${inst.path} sent to ${to} ${maxSendPasses} times in one flush. Updates that answer each other loop: answer a send with state, or send from a user event.`
    )
    failInstance(inst, Cause.die(error), "send")
    return false
  }
  /**
   * The nearest instance of `definition` from `from` up: a definition, since `provide` and stories copy
   * components.
   */
  const nearestOwner = (from: Instance | undefined, definition: Component.Definition.Any): Instance | undefined => {
    for (let at = from; at !== undefined; at = at.parent) {
      if (at.component.definition === definition) return at
    }
    return undefined
  }
  /**
   * How an error ends when `nearestOwner` finds none. The types know an owner by its name, so a different
   * component with that name may be above.
   */
  const ownerAbsent = (from: Instance | undefined, definition: Component.Definition.Any): string => {
    for (let at = from; at !== undefined; at = at.parent) {
      if (at.component.definition.name === definition.name) {
        return `but a different component with the same name is above it at ${at.path}`
      }
    }
    return `and no ${definition.name} is above it`
  }
  /**
   * A reader of shared state finds the owner of each definition it reads, once, at mount, and registers
   * with it. An optional owner that isn't above is left out. A required owner must match by definition,
   * not just by name. An `onChange` starts from the value the reader mounts with.
   */
  const findOwners = (inst: Instance) => {
    for (const read of sharedReads.readsOf(inst.component.definition)) {
      const definition = read.owner.definition
      const owner = nearestOwner(inst.parent, definition)
      if (owner === undefined) {
        if (read.optional) continue
        throw new Error(
          `${inst.path} reads the shared state of ${definition.name}, ${ownerAbsent(inst.parent, definition)}`
        )
      }
      ;(inst.owners ??= new Map()).set(definition, owner)
      ;(owner.readers ??= new Set()).add(inst)
      if (read.onChange !== undefined) (inst.seen ??= new Map()).set(owner, owner.shares)
    }
  }
  /** What `h.shared` and `p.shared` query: each owner's current value, `undefined` for one that's absent. */
  const sharedOf = (inst: Instance): Component.SharedLookup | undefined => {
    const owners = inst.owners
    return owners === undefined ? undefined : (owner) => owners.get(owner.definition)?.shares
  }
  /**
   * Recomputes an owner's shared value from its Model and props, and marks its readers dirty when it
   * changed. A change queues one round of the readers' `onChange`, if none is queued: `seq` is the
   * entry that made it. Marks the owners the instance reports to, whose reports are read after the pass.
   * Returns `false` when `shares` threw and failed the owner.
   */
  const refreshShares = (inst: Instance, seq: number): boolean => {
    markReports(inst)
    const shares = inst.component.definition.shares
    if (shares === undefined) return true
    let next: unknown
    try {
      next = shares(inst.model, inst.props)
    } catch (error) {
      failInstance(inst, Cause.die(error), "shares")
      return false
    }
    if (sharedEqual(inst.shares, next)) return true
    inst.shares = next
    const owning = inst.owning!
    owning.seq = seq
    if (inst.readers !== undefined) {
      let listened = false
      for (const reader of inst.readers) {
        if (reader.closed) continue
        markDirty(reader)
        if (reader.seen?.has(inst)) listened = true
      }
      if (listened && !owning.round) {
        owning.round = true
        defer(() => runRound(inst))
      }
    }
    return true
  }
  /**
   * One round of an owner's readers' `onChange`, before the next render: each reader whose last seen
   * value differs from the current one gets its message, so the values in between are skipped and a
   * value that changed back sends nothing. A round that sends spends one of the owner's passes.
   */
  const runRound = (owner: Instance) => {
    owner.owning!.round = false
    if (owner.closed || owner.failure !== undefined || owner.readers === undefined) return
    // Read together: a reader's reply can change the owner before the next reader is told.
    const value = owner.shares
    const source = { _tag: "Shared", path: owner.path, seq: owner.owning!.seq } as const
    let counted = false
    for (const reader of Array.from(owner.readers)) {
      const seen = reader.seen
      if (
        seen === undefined || !seen.has(owner) || reader.closed || reader.failure !== undefined || reader.waiting ||
        sharedEqual(seen.get(owner), value)
      ) continue
      if (!counted) {
        counted = true
        if (!countShared(owner)) return
      }
      seen.set(owner, value)
      // `define` allows one `onChange` per owner.
      const read = sharedReads.readsOf(reader.component.definition).find((read) =>
        read.onChange !== undefined && reader.owners?.get(read.owner.definition) === owner
      )!
      const message = guard(reader, "shared", () => read.onChange!(value), read.name)
      if (message !== undefined && !reader.closed) reader.dispatch(message, { ...source, name: read.name })
      if (owner.closed) return
    }
  }
  /** Marks the owners `inst` reports to, for a report that may have changed, come or gone. */
  const markReports = (inst: Instance) => {
    const owners = inst.owners
    if (owners === undefined) return
    for (const read of sharedReads.readsOf(inst.component.definition)) {
      if (read.report === undefined) continue
      const owner = owners.get(read.owner.definition)
      if (owner === undefined || owner.closed || owner.component.definition.collects === undefined) continue
      dueReports(owner)
    }
  }
  /**
   * Reads every current report of an owner, once nothing is left to render, and dispatches what
   * `collects.onChange` returns for them when it differs from what it last returned. The first comparison is
   * with its message for no reports, so readers that mount reporting nothing new send nothing.
   */
  const deliverReports = (owner: Instance) => {
    const from = reportsDue.get(owner)
    reportsDue.delete(owner)
    if (from === undefined) collectReports(owner)
    else under(from, () => collectReports(owner))
  }
  const collectReports = (owner: Instance) => {
    const collects = owner.component.definition.collects
    if (collects === undefined || owner.closed || owner.failure !== undefined || owner.waiting) return
    const owning = owner.owning!
    // The server's message is compared with every reader that adopts, so one still building its Layer isn't
    // counted as gone. Settling it delivers the owner again.
    if (owning.restored) {
      if (waitsBelow(owner)) {
        heldReports.add(owner)
        return
      }
      owning.restored = false
    }
    const reports: Array<unknown> = []
    for (const reader of owner.readers ?? []) {
      if (reader.left || reader.closed || reader.failure !== undefined) continue
      for (const read of sharedReads.readsOf(reader.component.definition)) {
        if (read.report === undefined || reader.owners?.get(read.owner.definition) !== owner) continue
        const report = guard(reader, "shared", () => read.report!(reader.model, reader.props), read.name)
        // The reader failed, and leaving marked the owner again.
        if (reader.failure !== undefined) return
        reports.push(report)
      }
    }
    const message = guard(owner, "shares", () => {
      owning.collected ??= { message: collects.onChange([]) }
      return { value: collects.onChange(reports as Array<never>) }
    })
    if (message === undefined || sharedEqual(owning.collected!.message, message.value)) return
    owning.collected = { message: message.value }
    if (!countShared(owner)) return
    owner.dispatch(message.value, { _tag: "Collected" })
  }
  /** Whether an instance below `inst` still waits for its Layer before it adopts. */
  const waitsBelow = (inst: Instance): boolean => {
    for (const child of inst.children) {
      if (child.closed || child.failure !== undefined) continue
      if (child.waiting || waitsBelow(child)) return true
    }
    return false
  }
  /**
   * Counts one more pass of an owner's shared value through its readers in this flush, and fails the
   * owner past the limit. Every loop between a shared value, the readers' `report` and `onChange`, and
   * the owner's `collects.onChange` passes through the owner, so failing it alone stops the loop.
   */
  const countShared = (owner: Instance): boolean => {
    const passes = (sharedPasses.get(owner) ?? 0) + 1
    sharedPasses.set(owner, passes)
    if (passes <= maxSendPasses) return true
    const error = new Error(
      `${owner.path} sent its readers' onChange or its own collects.onChange ${maxSendPasses} times in one flush. A reader whose onChange or report answers the shared value with a change of it loops: answer with a value that settles.`
    )
    failInstance(owner, Cause.die(error), "shares")
    return false
  }
  /**
   * Delivers `$.send(Owner, message)`s to the nearest owner of each above `inst`, in order. A send to an
   * owner the sender reads as optional, with none above, is dropped. A send to another owner that
   * isn't above fails the sender.
   */
  const sendToOwners = (inst: Instance, sends: ReadonlyArray<Component.Send>, entrySeq: number) => {
    let counted = false
    for (const [index, send] of sends.entries()) {
      if (send.owner === undefined) continue
      if (inst.closed) return
      const definition = send.owner.definition
      if (!counted) {
        counted = true
        if (!countSends(inst, definition.name)) return
      }
      const owner = nearestOwner(inst.parent, definition)
      if (
        owner === undefined &&
        sharedReads.readsOf(inst.component.definition).some((read) =>
          read.optional && read.owner.definition === definition
        )
      ) {
        record(inst, { _tag: "SendDropped", ref: definition.name, issued: { seq: entrySeq, index }, reason: "absent" })
        continue
      }
      if (owner === undefined) {
        const error = new Error(`${inst.path} sent to ${definition.name}, ${ownerAbsent(inst.parent, definition)}`)
        failInstance(inst, Cause.die(error), "send")
        return
      }
      owner.dispatch(send.message, { _tag: "Send", path: inst.path, seq: entrySeq })
    }
  }
  /**
   * Delivers the sends of `inst`'s updates to its direct children, matched by ref key in its last
   * render. A send whose child can't take it is dropped and logged, never kept for a later instance.
   */
  const deliverSends = (inst: Instance) => {
    if (inst.outbox.length === 0 || inst.closed) return
    const outbox = inst.outbox
    inst.outbox = emptyList
    if (!countSends(inst, "its children")) return
    for (const { issued, send } of outbox) {
      if (inst.closed) return
      // A headless instance wrote none of the tree it renders, so it has no children to send to.
      const child = inst.owner === undefined ? findChild(inst.rendered, send.ref.key) : undefined
      const reason: MessageLog.SendDropped["reason"] | undefined = child === undefined
        ? "unrendered"
        : child._tag === "Fallback"
        ? (child.failedChild ? "failed" : "fallback")
        : child.inst.failure !== undefined
        ? "failed"
        : child.inst.closed
        ? "unrendered"
        : child.inst.waiting
        ? "waiting"
        : undefined
      if (reason !== undefined) {
        record(inst, { _tag: "SendDropped", ref: send.ref.key, issued, reason })
        continue
      }
      ;(child as RChild).inst.dispatch(send.message, { _tag: "Send", path: inst.path, seq: issued.seq })
    }
  }
  const deliverEvents = (inst: Instance, events: ReadonlyArray<unknown>, entrySeq: number) => {
    // The child's `onEmit` was written by the author of the tree it sits in.
    const parent = inst.parent?.author
    for (const emitted of events) {
      if (inst.closed) return
      if (parent === undefined) {
        rootEmitted.push(emitted)
        continue
      }
      const message = guard(parent, "onEmit", () => inst.onEmit(emitted))
      if (message !== undefined) parent.dispatch(message, { _tag: "Emit", path: inst.path, seq: entrySeq })
    }
  }

  // -- Commands -------------------------------------------------------------
  const entriesOf = (inst: Instance): Array<schedule.Entry<Run>> => inst.runs.map(entryOf)
  const entryOf = (run: Run): schedule.Entry<Run> => ({
    name: run.command.name,
    key: run.command.groupKey,
    mode: run.command.mode,
    status: run.status,
    value: run
  })

  /** `initIndex` is the Command's position among those `init` returned, or `undefined` for `update`'s. */
  const issue = (
    inst: Instance,
    command: Command.Command<any, any>,
    issued: MessageLog.Issued,
    initIndex: number | undefined
  ) => {
    // A patch that threw on an earlier Command of the same step failed the instance.
    if (inst.closed) return
    if (server !== undefined) {
      // No Command runs on the server. `init`'s are dropped silently, since the client reruns them when
      // it adopts. One from `update`, an interrupt included, is logged and reported.
      if (initIndex !== undefined) return
      record(inst, { _tag: "CommandDropped", name: command.name, issued, reason: "server" })
      report(
        new Command.ServerCommandIssued({
          path: inst.path,
          command: command.name,
          message:
            `[@effect/ui] ${inst.path}'s update issued ${command.name} during server rendering, and it was dropped. No Command runs on the server: read data with a query.`
        })
      )
      return
    }
    const decision = schedule.schedule(entriesOf(inst), command)
    if (command._tag === "Interrupt") {
      for (const entry of decision.interrupt) stopRun(inst, entry.value)
      return
    }
    switch (decision.action) {
      case "start":
      case "queue": {
        // The cache begins the run at issue, so its patches are live before it starts, and before
        // `switch` stops the earlier runs: the new patch layers over the old until the old fiber exits.
        let handle: Query.RunHandle | undefined
        // Without the `Query` module there's no cache, and nothing a run could invalidate, patch or read.
        const runs = command.service === undefined ? undefined : cache ?? cell.get()
        if (runs !== undefined) {
          try {
            handle = beginRun(runs, command)
          } catch (error) {
            // Like a throw in `update`: the run doesn't start and the issuing instance fails.
            failInstance(inst, Cause.die(error), initIndex === undefined ? "update" : "init", command.name)
            return
          }
        }
        // A cut run that awaits delivers here, so `update` gets it after the new patch and before the new fiber.
        for (const entry of decision.interrupt) stopRun(inst, entry.value, "switch")
        const run: Run = {
          command,
          issued,
          handle,
          status: decision.action === "start" ? "running" : "queued",
          fiber: undefined,
          done: false,
          held: undefined,
          silent: undefined,
          spanId: undefined,
          traceId: undefined,
          waiting: false,
          waited: undefined,
          cancelWait: undefined,
          cutBy: undefined
        }
        if (inst.runs === emptyList) inst.runs = []
        inst.runs.push(run)
        if (runs === undefined && command.service !== undefined && command.writes !== undefined) {
          ;(early ??= new Set()).add(run)
        }
        // Issued before a keyed provide's due read: a change of key keeps it.
        dueSelection(inst)?.issued.add(run)
        if (run.status === "running") startRun(inst, run)
        // Queued behind the runs `switch` cut, it starts now if none of them had a fiber to wait for.
        else promote(inst, run)
        return
      }
    }
  }

  const removeRun = (inst: Instance, run: Run) => {
    run.done = true
    early?.delete(run)
    const index = inst.runs.indexOf(run)
    if (index >= 0) inst.runs.splice(index, 1)
  }

  /**
   * Starts the next queued run of `run`'s group, once nothing in the group is running or stopping. A
   * closed instance starts nothing: its queued runs are stopped.
   */
  const promote = (inst: Instance, run: Run) => {
    for (;;) {
      const next = schedule.next(entriesOf(inst), entryOf(run))
      if (next === undefined) return
      if (inst.closed) {
        stopRun(inst, next.value)
        continue
      }
      next.value.status = "running"
      startRun(inst, next.value)
      return
    }
  }

  /**
   * Asks a run to stop: it delivers nothing from now on. A run whose fiber is going is interrupted
   * and stays in the schedule as `stopping` until the fiber exits, cleanup included: until then it
   * holds its group and `h.isRunning` counts it. One that never got a fiber leaves at once, and is
   * stopped at the cache here.
   *
   * A wait only delays a message: an awaiting run delivers it at once, whatever stops it, unless its
   * instance is gone. `by` is what the log says cut its wait.
   */
  const stopRun = (inst: Instance, run: Run, by: "switch" | "interrupt" = "interrupt") => {
    if (run.done) return
    if (run.held !== undefined) {
      const closed = inst.closed || rootClosed
      endWait(run, closed ? "closed" : by)
      if (closed) {
        run.held = undefined
        removeRun(inst, run)
        recordEnded(inst, run)
      } else {
        deliver(inst, run)
      }
      return
    }
    const fiber = run.fiber
    if (fiber !== undefined && fiber.pollUnsafe() === undefined) {
      // Left and logged by `ended`, once the fiber has exited.
      run.done = true
      run.status = "stopping"
      run.cutBy = origin
      fiber.interruptUnsafe()
      return
    }
    removeRun(inst, run)
    if (fiber === undefined) run.handle?.finish({ _tag: "Stopped" })
    recordInterrupted(inst, run)
    if (!inst.closed) markDirty(inst)
    promote(inst, run)
  }

  /**
   * Stops a run and returns an Effect that waits for its fiber to exit. The run is stopped when this
   * is called, not when the Effect runs, so an owner stops every run before it waits for any.
   */
  const stopAndAwait = (inst: Instance, run: Run): Effect.Effect<void> => {
    const fiber = run.fiber
    stopRun(inst, run)
    return fiber === undefined ? Effect.void : Effect.asVoid(Fiber.await(fiber))
  }
  const awaitRuns = (waits: ReadonlyArray<Effect.Effect<void>>): Effect.Effect<void> =>
    waits.length === 0 ? Effect.void : Effect.all(waits, { concurrency: "unbounded", discard: true })
  // Repeats until nothing is left, since a close that finishes can stop more runs.
  const awaitAllOwned: Effect.Effect<void> = Effect.suspend(() =>
    liveRuns.size === 0 && closing.size === 0
      ? Effect.void
      : Effect.andThen(Fiber.awaitAll([...liveRuns, ...closing]), awaitAllOwned)
  )

  const startRun = (inst: Instance, run: Run) => {
    // A navigation runs in the deferred work of the flush its `update` caused, before that flush
    // renders. The Router delivers the route from inside the navigation, so the root and its pages
    // render the new route in that flush and never once more with the old one, which would write a
    // controlled input's old value back. One issued while the root mounts, from an `init`, runs on
    // the scheduler as other Commands do: the root isn't attached to the Router yet.
    const go = attached && services.isNavigation(run.command)
      ? (envCtx: Context.Context<any>) => defer(() => goNow(envCtx, forkNow))
      : (envCtx: Context.Context<any>) => goNow(envCtx, forkLater)
    const goNow = (envCtx: Context.Context<any>, fork: typeof forkNow) => {
      if (run.done || frozen) return
      const command = run.command
      // Every run gets a Scope of its own, closed with the run's exit before its fiber exits, so what
      // the body acquires is released when the run ends, not when its instance does.
      const scope = Scope.makeUnsafe("sequential")
      const context = withCache(
        Context.add(Context.add(envCtx, Scope.Scope, scope), services.Refs, refsOf(inst))
      )
      let source: MessageLog.Source = {
        _tag: "Command",
        name: command.name,
        issued: run.issued,
        spanId: undefined,
        traceId: undefined
      }
      // A Stream element: `Component.noop` sends nothing, and the Stream carries on.
      const send = (message: unknown) => {
        if (run.done) return
        const silent = isNoop(message)
        run.silent = silent && run.silent !== false
        if (!silent) inst.dispatch(message, source)
      }
      // The fiber runs the definition's own work, so its exit tells a success from a typed failure.
      const program = Effect.useSpan(
        command.name,
        { attributes: { path: inst.path, mode: command.mode } },
        (span): Effect.Effect<unknown, unknown, any> => {
          // Stopped before the first step, or its instance started closing while the fork waited for
          // the scheduler: the work never begins.
          if (run.done || inst.closed) return Effect.interrupt
          // Kept on the run as well, for the end entries of a run that sends no message.
          run.spanId = span.spanId
          run.traceId = span.traceId
          source = {
            _tag: "Command",
            name: command.name,
            issued: run.issued,
            spanId: span.spanId,
            traceId: span.traceId
          }
          const work: Effect.Effect<unknown, unknown, any> = command._tag === "Effect"
            ? command.work
            : Stream.runForEach(command.work, (element) => Effect.sync(() => send(command.resolve(element as never))))
          const writes = command.writes as ((success: unknown) => ReadonlyArray<Query.Write>) | undefined
          if (run.handle !== undefined) return run.handle.run(work, writes)
          if (writes === undefined) return work
          // Issued before the app loaded `Query`, so with nothing to invalidate or patch: both are made
          // by `Query`. Its run begins when the cache is made, which can be while this work goes on.
          return Effect.uninterruptibleMask((restore) =>
            Effect.flatMap(Effect.exit(restore(work)), (exit) => {
              let sets: ReadonlyArray<Query.Write> | undefined
              if (run.handle === undefined && exit._tag === "Success") {
                // No cache has been made, so `writes` is called here. A throw fails the run, as at the cache.
                try {
                  sets = writes(exit.value)
                } catch (error) {
                  early?.delete(run)
                  return Effect.die(error)
                }
                // Only `Query` makes a write, so it is loaded: the cache is made now, and begins this run.
                if (sets.length > 0) cell.get()
              }
              const handle = run.handle
              const made = sets
              if (handle !== undefined) return handle.run(exit, made === undefined ? writes : () => made)
              // Its work is over: a cache made from here on has no run to begin for it.
              early?.delete(run)
              return exit
            })
          )
        }
      )
      const fiber = fork(context, Effect.onExit(program, (exit) => Scope.close(scope, exit)))
      run.fiber = fiber
      track(liveRuns, fiber)
      fiber.addObserver((exit) => step(() => ended(inst, run, exit, source)))
    }
    // After a handled Layer failure, work runs against the parent's services. A run issued before a
    // keyed provide's due read starts against the selection the read leaves.
    onceSelected(inst, go, () => stopRun(inst, run))
  }

  const beginRun = (made: queryCore.Cache, command: Run["command"]): Query.RunHandle =>
    made.beginRun({
      command: command.name,
      invalidates: command.invalidates as ReadonlyArray<Query.Target>,
      optimistic: command.optimistic as ReadonlyArray<Query.Patch>,
      afterRefetch: command._tag === "Effect" && command.afterRefetch !== undefined
    })

  /**
   * A run's fiber exited. The cache has already had its patch removal, `writes` and invalidation, from
   * the body's own exit. Then the result message is sent, unless the instance is gone.
   */
  const ended = (
    inst: Instance,
    run: Run,
    exit: Exit.Exit<unknown, unknown>,
    source: MessageLog.Source
  ) => {
    const command = run.command
    // Only acts when the work never began.
    run.handle?.finish({ _tag: "Stopped" })
    if (run.status === "stopping") {
      // A stopped run sends nothing. It leaves now, so its group is free, `h.isRunning` ends and the
      // log says so. A defect in its cleanup can't fail the run that replaced it: it is reported.
      removeRun(inst, run)
      recordInterrupted(inst, run)
      if (Exit.isFailure(exit) && Cause.hasDies(exit.cause)) {
        report(
          new Command.CleanupFailed({
            path: inst.path,
            command: command.name,
            cause: exit.cause,
            message:
              `[@effect/ui] ${inst.path}'s Command ${command.name} was stopped, and it died before its fiber exited.`
          })
        )
      }
      if (!inst.closed) markDirty(inst)
      promote(inst, run)
      return
    }
    if (run.done) return
    const interrupted = Exit.isFailure(exit) && !Cause.hasDies(exit.cause) && !Cause.hasFails(exit.cause)
    const waits = command._tag === "Effect" && command.afterRefetch !== undefined && Exit.isSuccess(exit)
    if (inst.closed) {
      // It ended while its instance closes, before the close stopped it. Its message is dropped, and a
      // failure tells only the log.
      removeRun(inst, run)
      if (interrupted) recordInterrupted(inst, run)
      else {
        if (Exit.isFailure(exit)) {
          forkNow(ctx, Effect.logError(`${inst.path} is gone, and its Command ${command.name} failed`, exit.cause))
        }
        if (waits) run.waited = { waitEnded: "closed", outstanding: run.handle?.outstanding() ?? [] }
        recordEnded(inst, run)
      }
      promote(inst, run)
      return
    }
    if (interrupted) {
      removeRun(inst, run)
      recordInterrupted(inst, run)
      markDirty(inst)
      promote(inst, run)
      return
    }
    const reject = command.reject
    if (Exit.isFailure(exit) && (Cause.hasDies(exit.cause) || reject === undefined)) {
      // A typed failure nothing maps is a defect too: an unmatched Command got past the types.
      removeRun(inst, run)
      failInstance(inst, exit.cause, "command", command.name)
      return
    }
    if (Exit.isSuccess(exit) && command._tag === "Stream") {
      removeRun(inst, run)
      recordEnded(inst, run)
      markDirty(inst)
      promote(inst, run)
      return
    }
    const message = guard(
      inst,
      "command",
      () =>
        Exit.isFailure(exit)
          ? { value: reject!(Option.getOrUndefined(Cause.findErrorOption(exit.cause)) as never) }
          : { value: command.resolve(exit.value as never) },
      command.name
    )
    if (message === undefined || run.done) return
    // Known now, though applied at delivery: a silent result is held like a message.
    run.silent = isNoop(message.value) && run.silent !== false
    // From here until delivery the run is awaiting: on its own wait, or under `queue` behind an earlier
    // message of its group. Either way the next queued run starts now, before any `update` this
    // delivers can issue another run of the group, which would otherwise start ahead of it.
    run.status = "awaiting"
    run.held = { message: message.value, source }
    promote(inst, run)
    if (waits) beginWait(inst, run)
    release(inst, run)
  }

  /**
   * At fiber exit of a run issued with `Command.afterRefetch`: the awaited set is fixed, and the wait
   * ends on its last refetch or on the budget. An empty set, a spent budget or a set that already
   * settled ends it here. The budget runs from when the cache applied the invalidation, which can be
   * earlier than fiber exit.
   */
  const beginWait = (inst: Instance, run: Run) => {
    const handle = run.handle
    const awaited = handle?.awaited() ?? []
    if (handle === undefined || awaited.length === 0) {
      run.waited = { waitEnded: "nothing", outstanding: [] }
      return
    }
    record(inst, { _tag: "CommandAwaiting", name: run.command.name, issued: run.issued, entries: awaited })
    run.waiting = true
    const budget = run.command.afterRefetch!
    if (handle.outstanding().length === 0) return endWait(run, "settled")
    const remaining = Duration.isFinite(budget)
      ? Math.max(0, Duration.toMillis(budget) - handle.sinceApplied())
      : Infinity
    if (remaining === 0) return endWait(run, "budget")
    // After the cache's emission: a single query's result is already written, and a keyed query's is
    // queued in the flush's deferred work, which the delivery goes behind.
    const ended = (by: MessageLog.WaitEnded) =>
      step(() => {
        endWait(run, by)
        defer(() => release(inst, run))
      })
    const off = handle.onRefetched(() => ended("settled"))
    const timer = Number.isFinite(remaining)
      ? forkNow(ctx, Effect.andThen(Effect.sleep(Duration.millis(remaining)), Effect.sync(() => ended("budget"))))
      : undefined
    run.cancelWait = () => {
      off()
      timer?.interruptUnsafe()
    }
  }
  const endWait = (run: Run, by: MessageLog.WaitEnded) => {
    if (!run.waiting) return
    run.waiting = false
    run.waited = { waitEnded: by, outstanding: by === "settled" ? [] : run.handle!.outstanding() }
    const cancel = run.cancelWait
    run.cancelWait = undefined
    cancel?.()
  }
  /** Delivers the messages of `run`'s group that can go now, in the order `schedule.deliverable` gives. */
  const release = (inst: Instance, run: Run) => {
    for (;;) {
      if (run.command.mode !== "queue" && run.done) return
      const next = schedule.deliverable(entriesOf(inst), entryOf(run), (other) => !other.waiting)
      if (next === undefined) return
      if (inst.closed || rootClosed) return stopRun(inst, next.value)
      deliver(inst, next.value)
    }
  }
  /**
   * Sends an awaiting run's message, or nothing for `Component.noop`. The run is still in the schedule
   * while `update` handles it.
   */
  const deliver = (inst: Instance, run: Run) => {
    const held = run.held!
    run.held = undefined
    if (!isNoop(held.message)) inst.dispatch(held.message, held.source)
    if (run.done) return
    removeRun(inst, run)
    recordEnded(inst, run)
    // `h.isRunning` ends with the message, which rendered the run still in the schedule.
    if (!inst.closed) markDirty(inst)
  }
  const recordEnded = (inst: Instance, run: Run) =>
    record(inst, {
      _tag: "CommandEnded",
      name: run.command.name,
      issued: run.issued,
      spanId: run.spanId,
      traceId: run.traceId,
      silent: run.silent === true,
      ...run.waited
    })
  const recordInterrupted = (inst: Instance, run: Run) =>
    record(inst, {
      _tag: "CommandInterrupted",
      name: run.command.name,
      issued: run.issued,
      spanId: run.spanId,
      traceId: run.traceId
    }, run.cutBy)

  /** `h.isRunning` for one instance: a run of the Command in the schedule, of the group if given. */
  const runningOf = (inst: Instance) => (name: string, groupKey: string | undefined): boolean =>
    inst.runs.some((run) => run.command.name === name && (groupKey === undefined || run.command.groupKey === groupKey))

  // -- Subscriptions --------------------------------------------------------
  // On the server: whether the root's Subscriptions were sampled for their checks.
  let rootChecked = false
  /** `watchesOnly`: before the first render, when only the cache watchers register. */
  const syncSubscriptions = (inst: Instance, watchesOnly = false) => {
    const subscriptions = inst.component.subscriptions
    const bound = queryCore.boundOf(inst.component)
    // A waiting instance has no Model yet.
    if (inst.closed || inst.waiting || (subscriptions === undefined && bound === undefined)) return
    // A keyed provide's read is due: nothing starts against services that may be about to go. The read
    // syncs. Before the first view the watches follow the Model at once, and the read restarts them.
    const due = inst.mounting === undefined ? dueSelection(inst) : undefined
    if (due !== undefined) {
      due.skipped = true
      return
    }
    // Sample the root once for server checks, and query components for their watches.
    // Nothing under a Layer kept off the server is sampled.
    const checkRoot = server !== undefined && inst.parent === undefined && !rootChecked && subscriptions !== undefined
    if (server !== undefined) {
      if (inst.env.never || (!checkRoot && bound === undefined)) return
      if (checkRoot) rootChecked = true
    }
    const watches = bound === undefined
      ? []
      : guard(inst, "subscription", () => bound.context(inst.model, inst.props, inst.results).watches())
    if (watches === undefined) return
    // A throw from the root's check fails the render: `guard` would defer the root to the client, unchecked.
    // On the server only the root's are sampled, for their checks.
    const wanted = subscriptions === undefined || (server !== undefined && !checkRoot)
      ? []
      : checkRoot
      ? subscriptions(inst.model, inst.props, inst.results)
      : guard(inst, "subscription", () => subscriptions(inst.model, inst.props, inst.results))
    if (wanted === undefined) return
    const byKey = new Map<string, Subscription.Subscription<any, any>>()
    const markers = new Map<string, componentQueries.Marker>()
    let declaration: services.Prefetch | undefined
    for (const subscription of [...watches, ...wanted]) {
      const declared = (subscription as { readonly [services.prefetch]?: services.Prefetch })[services.prefetch]
      if (declared !== undefined) {
        if (declaration !== undefined) {
          return failInstance(
            inst,
            Cause.die(
              new Error(
                `${inst.path}: subscriptions returned Router.prefetch twice. An instance declares its routes' reads in one map.`
              )
            ),
            "subscription",
            "@effect/ui/Router/prefetch"
          )
        }
        declaration = declared
        continue
      }
      const marker = queryCore.markerOf(subscription)
      const group = marker === undefined ? queryCore.groupOf(subscription) : undefined
      if (marker !== undefined) {
        if (!markers.has(subscription.key)) markers.set(subscription.key, marker)
      } else if (group !== undefined) syncGroup(inst, group)
      else if (queryCore.isWatchKey(subscription.key)) {
        return failInstance(
          inst,
          Cause.die(new Error(`${inst.path}: the Subscription key ${subscription.key} is reserved for queries.`)),
          "subscription",
          subscription.key
        )
      } else if (byKey.has(subscription.key)) {
        // A key runs one Stream, so the second entry would never start, and nothing would say so.
        return failInstance(
          inst,
          Cause.die(subscriptionKeys.duplicateKey(inst.path, subscription.key)),
          "subscription",
          subscription.key
        )
      } else byKey.set(subscription.key, subscription)
    }
    if (checkRoot) {
      for (const subscription of byKey.values()) {
        const hook = (subscription as services.OnServer)[services.onServer]
        if (hook !== undefined) whenReady(inst.env, (envCtx) => hook(envCtx, report))
      }
    }
    const folds = syncWatches(inst, markers)
    // Nothing is prefetched on the server.
    if (server === undefined) syncPrefetch(inst, declaration)
    // Streams never run on the server.
    if (!watchesOnly && server === undefined) syncStreams(inst, byKey)
    // The cache never calls back with the state at registration. Each new watcher's settled value
    // is written as its query's result here, once the watchers and Streams follow the state that asked for
    // them, and so before this instance's next render. A keyed query's go to its next drain.
    for (const fold of folds) fold()
    // The key set may have changed: the next drain checks for a prune.
    if (inst.keyed !== undefined && inst.keyed.size > 0) requestKeyed(inst)
  }
  const syncStreams = (inst: Instance, byKey: Map<string, Subscription.Subscription<any, any>>) => {
    // Close first, so `room:1` and `room:2` are never both connected.
    if (inst.subscriptions === undefined) {
      if (byKey.size === 0) return
      inst.subscriptions = new Map()
    }
    const subscriptions = inst.subscriptions
    for (const [key, running] of subscriptions) {
      if (byKey.has(key)) continue
      subscriptions.delete(key)
      record(inst, { _tag: "SubscriptionStopped", key, name: running.name, deps: running.deps })
      closeUnder(inst, running.scope)
    }
    for (const [key, subscription] of byKey) {
      const existing = subscriptions.get(key)
      if (existing !== undefined) {
        // A running key keeps its Stream, and an attached one reads its declaration from here.
        existing.latest = subscription
        continue
      }
      const { deps, name } = subscription
      const running: SubscriptionRun = {
        name,
        deps,
        scope: Scope.forkUnsafe(inst.scope, "sequential"),
        fiber: undefined,
        latest: subscription
      }
      subscriptions.set(key, running)
      record(inst, { _tag: "SubscriptionStarted", key, name, deps })
      const current = () => !inst.closed && subscriptions.get(key) === running
      const go = (envCtx: Context.Context<any>) => {
        if (!current()) return
        const source: MessageLog.Source = { _tag: "Subscription", key, name, deps }
        const context = withCache(
          Context.add(Context.add(envCtx, Scope.Scope, running.scope), services.CurrentRoot, () => handle)
        )
        // Rendering the ancestors may stop this key, or change its declaration, as for a query result.
        const enter = (f: (latest: Subscription.Subscription<any, any>) => void) =>
          step(() => {
            renderAbove(inst)
            if (current()) f(running.latest)
          })
        const deliver = (message: unknown, accepted?: () => void) =>
          enter(() => {
            accepted?.()
            inst.dispatch(message, source)
          })
        // Attached to its source, it dispatches synchronously, and only its first check waits.
        const attachedTo = (subscription as services.Direct)[services.direct]?.(context, (message, accepted) => {
          if (current()) deliver(message, accepted)
        }, (cause) => {
          if (current()) step(() => failInstance(inst, cause, "subscription", key))
        }, enter)
        if (attachedTo !== undefined) addFinalizer(running.scope, Effect.sync(attachedTo.close))
        const fiber = forkLater(
          context,
          attachedTo !== undefined
            ? attachedTo.initial
            : Stream.runForEach(subscription.stream, (message) => Effect.sync(() => deliver(message)))
        )
        running.fiber = fiber
        interruptOnClose(running.scope, fiber)
        // A Stream that ends stays stopped until its key leaves and comes back.
        fiber.addObserver((exit) => {
          if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
            step(() => failInstance(inst, exit.cause, "subscription", key))
          }
        })
      }
      startWatching(inst, go)
    }
  }

  // -- watches --------------------------------------------------------------
  /**
   * Registers and unregisters cache watchers from the watch markers, synchronously: the watcher
   * count, and with it whether a watch is a zero-to-one or a join, never waits for the scheduler.
   * New args are a new key, so the old watcher goes before the new one registers.
   *
   * A debounced query's new args, after mount and on the client, register once its delay has passed
   * on the Clock, unless registering now fetches nothing. Newer args are a new key: the waiting
   * watcher goes, and its sleep with it.
   */
  const syncWatches = (inst: Instance, markers: Map<string, componentQueries.Marker>): ReadonlyArray<() => void> => {
    if (inst.watches === undefined) {
      if (markers.size === 0) return []
      inst.watches = new Map()
    }
    const watches = inst.watches
    for (const [key, running] of watches) {
      if (markers.has(key)) continue
      watches.delete(key)
      // A debounced query's old args are obsolete: their fetch goes, unless another reader still needs it.
      releaseWatch(running, running.marker.debounce !== undefined)
      if (running.marker.keyed) {
        const run = inst.keyed?.get(running.marker.name)
        run?.values.delete(running.marker.argsKey!)
        run?.changes.delete(running.marker.argsKey!)
      }
    }
    // The first values of the watchers registered in this call, folded by the caller once the loop is done.
    let folds: Array<() => void> | undefined = []
    for (const [key, marker] of markers) {
      const existing = watches.get(key)
      if (existing !== undefined) {
        // The same args, the same watcher.
        existing.marker = marker
        continue
      }
      const def = queryModule().defOf(marker.query)
      const fetchKey = marker.argsKey === undefined ? undefined : def.logKey(marker.args, marker.argsKey)
      const logKey = fetchKey === undefined ? key : Subscription.keyOf(`~query/${marker.name}`, fetchKey)
      const running: WatchRun = { marker, logKey, handle: undefined, released: false, debounce: undefined }
      holdsWatchers = true
      watches.set(key, running)
      // A disabled query: the marker is inert.
      if (marker.argsKey === undefined) continue
      inst.watched?.add(entryKey(def.name, marker.argsKey))
      const entry = { args: marker.args, argsKey: marker.argsKey }
      // The step whose render declared these args: the watcher may register later, once the Layer is ready.
      const asked = origin
      let last:
        | {
          readonly result: AsyncResult.AsyncResult<any, any>
          readonly patched: boolean
          readonly more: Query.More<any> | undefined
        }
        | undefined
      const send = (
        result: AsyncResult.Success<any, any> | AsyncResult.Failure<any, any>,
        patched: boolean,
        more: Query.More<any> | undefined
      ) => {
        if (running.released || inst.closed) return
        // An emission equal to this watcher's last is skipped. A list's `more` changing is a message.
        if (
          last !== undefined && last.patched === patched && queryModule().sameMore(last.more, more) &&
          Equal.equals(last.result, result)
        ) return
        last = { result, patched, more }
        if (marker.keyed) {
          // Not a step: the keys' results collect, and the write that delivers them is one.
          const run = inst.keyed!.get(marker.name)!
          run.values.set(entry.argsKey, { args: entry.args, result, patched })
          run.changes.add(entry.argsKey)
          return requestKeyed(inst)
        }
        const bound = queryCore.boundOf(inst.component)!
        const query = bound.byName.get(marker.name)!
        // It may run inside another instance's `update`: a patch registered at issue reaches every
        // watcher before that `update` returns.
        step(() => {
          renderAbove(inst)
          if (running.released || inst.closed) return
          writeResult(inst, query, bound.snapshot(query, entry, result, patched, more), [], logKey)
        })
      }
      const go = (envCtx: Context.Context<any>) => {
        if (inst.closed || running.released) return
        const fetcher = Context.getOption(envCtx, marker.query as any)
        if (Option.isNone(fetcher)) {
          return failInstance(
            inst,
            Cause.die(new Error(`${inst.path}: nothing provides the query ${JSON.stringify(def.name)}`)),
            "subscription",
            logKey
          )
        }
        holdWatches()
        const from = asked ?? origin
        if (from !== undefined) watchCauses.set(entryKey(def.name, fetchKey!), from)
        const handle = queryCache().watch(
          def,
          marker.args,
          fetcher.value as (args: any) => Effect.Effect<any, any>,
          send,
          (cause) => {
            // A defect in a fetcher fails every watching instance. The cache never stores it.
            if (!running.released) step(() => failInstance(inst, cause, "subscription", logKey))
          },
          { patched: true }
        )
        running.handle = handle
        // Read when it is folded: an `update` in between may have patched the entry, and then the
        // cache has already called back with the newer value, which `send` skips as equal.
        const fold = () => {
          const current = handle.patchedView()
          if (current.result._tag !== "Initial") send(current.result, current.patched, handle.more())
        }
        // Registered later, once the instance's Layer is ready: there is no loop to wait for.
        if (folds !== undefined) folds.push(fold)
        else fold()
      }
      const start = () => startWatching(inst, go)
      if (
        marker.debounce === undefined || server !== undefined || !inst.watchesSynced || !wouldFetch(def, marker.args)
      ) {
        start()
        continue
      }
      // Its first value is folded when it registers: there is no loop to wait for. The fetch it starts
      // follows from the step that changed the args.
      running.debounce = forkNow(
        ctx,
        Effect.andThen(
          Effect.sleep(Duration.millis(marker.debounce)),
          Effect.sync(() =>
            step(() => {
              running.debounce = undefined
              start()
            }, asked)
          )
        )
      )
    }
    // The first Model after mount: the values folded before the first render never wait.
    if (inst.mounting === undefined) inst.watchesSynced = true
    const out = folds
    folds = undefined
    return out
  }
  /** Whether a watcher registering on the entry now starts a fetch: no watcher, nothing in flight, and stale or cold. */
  const wouldFetch = (def: ReturnType<typeof Query.defOf>, args: unknown): boolean => {
    const info = queryCache().inspect(def, args)
    return info === undefined || (info.watchers === 0 && info.fetch === "none" && info.stale)
  }
  /** A keyed query's keys follow the state. */
  const syncGroup = (inst: Instance, group: componentQueries.Group) => {
    const run = inst.keyed?.get(group.name)
    if (run !== undefined) run.group = group
    else {
      ;(inst.keyed ??= new Map()).set(group.name, {
        group,
        logKey: Subscription.keyOf(`~query/${group.name}`),
        values: new Map(),
        changes: new Set()
      })
    }
  }
  /**
   * Queues a drain of the instance's keyed queries in the flush's deferred work, which runs before
   * any render: changes from outside a render collect until then, and a patch registered at issue
   * still reaches the query before the flush renders the issuing update.
   */
  const requestKeyed = (inst: Instance) => {
    if (inst.keyedQueued) return
    inst.keyedQueued = true
    defer(() => {
      inst.keyedQueued = false
      renderAbove(inst)
      drainKeyed(inst)
    })
  }
  /**
   * Writes each keyed query's result that is due, at most once per query per round, and runs rounds
   * until none is due: a write, and the `update` of its `onChange`, can change the key set, or
   * another keyed query's keys. Runs at mount before the first view, before a kept child's view
   * when its props change, and as the deferred job. Nothing bounds the rounds, as nothing bounds a
   * single query whose args toggle.
   */
  const drainKeyed = (inst: Instance) => {
    const keyed = inst.keyed
    if (keyed === undefined) return
    let sent = true
    while (sent) {
      sent = false
      for (const run of keyed.values()) {
        if (inst.closed || inst.failure !== undefined || inst.waiting) return
        if (deliverKeyed(inst, run)) sent = true
      }
    }
  }
  /**
   * Writes a keyed query's result when a declared key's watcher emitted since the last write, or when
   * the result holds a key the query no longer returns. The result is sampled from the watchers now:
   * each declared key's last value.
   */
  const deliverKeyed = (inst: Instance, run: KeyedRun): boolean => {
    const group = run.group
    const declared = new Set(group.entries.map((entry) => entry.argsKey))
    const changes = group.entries.flatMap((entry) => {
      const value = run.changes.has(entry.argsKey) ? run.values.get(entry.argsKey) : undefined
      return value === undefined ? [] : [{ args: value.args, result: value.result }]
    })
    const held = queryModule().snapshotMapData(inst.results?.[group.name])
    let prune = false
    for (const key of held?.entries.keys() ?? []) {
      if (!declared.has(key)) {
        prune = true
        break
      }
    }
    run.changes.clear()
    if (!prune && changes.length === 0) return false
    const bound = queryCore.boundOf(inst.component)!
    const query = bound.byName.get(group.name)!
    const snapshot = bound.snapshotMany(
      query,
      group.entries.flatMap((entry) => {
        const value = run.values.get(entry.argsKey)
        return value === undefined ? [] : [bound.snapshot(query, entry, value.result, value.patched, undefined)]
      })
    )
    step(() => writeResult(inst, query, snapshot, changes, run.logKey))
    return true
  }
  /**
   * Writes a query's result, logs it and re-renders the instance. The watches follow the new results,
   * since a query's args can read another's result. Then the query's `onChange`, if any, sends
   * its message, whose `update` sees the result written.
   */
  const writeResult = (
    inst: Instance,
    query: componentQueries.Entry,
    result: unknown,
    changes: ReadonlyArray<componentQueries.KeyedChange>,
    key: string
  ) => {
    if (inst.closed || inst.waiting || frozen) return
    const bound = queryCore.boundOf(inst.component)!
    // The same snapshot, as when a watcher's first value is what the server or history already gave.
    if (Equal.equals((inst.results ?? bound.empty)[query.name], result)) return
    inst.results = { ...(inst.results ?? bound.empty), [query.name]: result }
    const changedSeq = record(inst, { _tag: "QueryChanged", name: query.name, result })
    const mounting = inst.mounting !== undefined
    if (!mounting) markDirty(inst)
    syncSubscriptions(inst, mounting)
    if (query.onChange === undefined || inst.closed || inst.failure !== undefined) return
    const message = guard(
      inst,
      "subscription",
      () => bound.context(inst.model, inst.props, inst.results).changed(query.name, changes),
      key
    )
    if (message !== undefined) inst.dispatch(message.value, { _tag: "Query", name: query.name, seq: changedSeq })
  }
  const releaseWatch = (running: WatchRun, abandon = false) => {
    if (running.released) return
    running.released = true
    running.debounce?.interruptUnsafe()
    running.handle?.unregister(abandon)
  }
  /** Drops an instance's watchers, and its descendants', at once. Closing its Scope comes after. */
  const releaseWatches = (inst: Instance) => {
    releasePrefetch(inst)
    if (inst.watches !== undefined) { for (const running of inst.watches.values()) releaseWatch(running) }
    if (inst.loadMores !== undefined) {
      for (const cancel of inst.loadMores) cancel()
      inst.loadMores.clear()
    }
    for (const child of inst.children) releaseWatches(child)
  }
  // -- Router.prefetch --------------------------------------------------------
  // The declaration's walk and its check are the Router's, reached through its hooks: an app without a
  // Router ships neither. This is what they read of the runtime, made when the first declaration arrives.
  let prefetching: prefetch.Runtime | undefined
  const prefetchRuntime = (): prefetch.Runtime =>
    prefetching ??= {
      now: () => clock.currentTimeMillisUnsafe(),
      report,
      cache: queryCache,
      entryKey,
      root: () => root,
      since: () => ({ born: instancesMade, build: builds }),
      lastFailedBuild: () => lastFailedBuild,
      record: () => {
        recording++
        let open = true
        return () => {
          if (!open) return
          open = false
          if (--recording > 0) return
          for (const at of recorded) at.watched = undefined
          recorded.clear()
        }
      },
      recorded
    }
  /** Registers, updates or drops the instance's declaration. The latest `subscriptions` run's map wins. */
  const syncPrefetch = (inst: Instance, declaration: services.Prefetch | undefined) => {
    if (declaration === undefined || hooks === undefined) return releasePrefetch(inst)
    if (inst.prefetch !== undefined) {
      inst.prefetch.declaration = declaration
      return
    }
    const state: NonNullable<Instance["prefetch"]> = { declaration, release: undefined }
    state.release = hooks.prefetch(prefetchRuntime(), inst, state)
    holdsWatchers = true
    inst.prefetch = state
  }
  const releasePrefetch = (inst: Instance) => {
    const prefetch = inst.prefetch
    if (prefetch === undefined) return
    inst.prefetch = undefined
    prefetch.release?.()
  }

  /**
   * Set once any instance of the tree has registered a watch, a load more or a prefetch declaration:
   * until then, the patcher's pre-pass has nothing to release and is skipped.
   */
  let holdsWatchers = false

  /** The same for whatever a rendered node holds: called before its replacement is created. */
  const releaseRendered = (rendered: Rendered): void => {
    switch (rendered._tag) {
      case "Child":
      case "Outlet":
        return releaseWatches(rendered.inst)
      case "Fallback":
      case "Detached":
        return releaseRendered(rendered.inner)
      case "Element": {
        for (const child of listOf(rendered.children)) releaseRendered(child)
        return
      }
      case "Text":
        return
    }
  }

  // -- refs and mounts ------------------------------------------------------
  /**
   * The node `who` put the ref `key` on. `author` wrote the tree `rendered` is in: the author's layer
   * of its elements is theirs, and an owned layer is its owner's. The search goes into headless
   * children, whose trees the same author wrote, and stops at any other child.
   */
  const findRef = (rendered: Rendered, key: string, who: Instance, author: Instance): unknown => {
    switch (rendered._tag) {
      case "Element": {
        const view = rendered.v
        if (author === who && view.refKey === key) return rendered.node
        if (who.owner !== undefined) {
          for (const layer of view.owned ?? none) {
            if (layer.owner === who.owner && layer.refKey === key) return rendered.node
          }
        }
        return firstDefined(listOf(rendered.children), (child) => findRef(child, key, who, author))
      }
      case "Fallback":
        return findRef(rendered.inner, key, who, author)
      case "Detached":
        // A detached child's nodes are out of the document: a ref in it finds none.
        return undefined
      case "Child":
        return rendered.inst.owner === undefined
          ? firstInOutlets(
            rendered.inst,
            (out) => firstDefined(out.rendered, (child) => findRef(child, key, who, author))
          )
          : firstDefined(rendered.inst.rendered, (child) => findRef(child, key, who, author))
      case "Text":
      case "Outlet":
        return undefined
    }
  }
  const firstDefined = <A>(items: ReadonlyArray<A>, f: (item: A) => unknown): unknown => {
    for (const item of items) {
      const found = f(item)
      if (found !== undefined) return found
    }
    return undefined
  }

  const refsOf = (inst: Instance): Renderer.Refs => ({
    lookup: <Node>(ref: Renderer.Ref<Node>) =>
      Effect.callback<Option.Option<Node>>((resume) => {
        afterCommit(() => {
          const found = inst.closed
            ? undefined
            : firstDefined(inst.rendered, (rendered) => findRef(rendered, ref.key, inst, inst.author))
          // A node in a detached child, the instance's own included, is out of the document.
          const node = found === undefined || isParked(found) ? undefined : found
          resume(Effect.succeed(Option.fromUndefinedOr(node as Node | undefined)))
        })
      })
  })

  /**
   * The containers that hold detached children's nodes. A host's handles may be numbers or strings, which a
   * host may hand out again. Each container belongs to the instance whose view declared the child, so it is
   * unregistered when the child is attached or removed, or when that instance leaves, whichever comes first.
   * The parked child failing doesn't end it: its fallback stays.
   */
  const parked = new Set<unknown>()
  const park = (owner: Instance, container: unknown) => {
    parked.add(container)
    ;(owner.parked ??= new Set()).add(container)
  }
  const unpark = (owner: Instance, container: unknown) => {
    parked.delete(container)
    owner.parked?.delete(container)
  }
  /** Whether `node` is in a detached child: its topmost ancestor is a container. */
  const isParked = (node: unknown): boolean => {
    if (parked.size === 0) return false
    let top = node
    for (let up = host.parentOf(top); up !== undefined; up = host.parentOf(up)) top = up
    return parked.has(top)
  }

  /**
   * `inst` is whose mount it is: it gets the message, and the failure. The Scope is forked from
   * `renderer`, the instance rendering the element, so the mount ends with that instance too.
   */
  const startMount = (
    inst: Instance,
    mount: View.Mount<any>,
    node: unknown,
    env: Env,
    renderer: Instance = inst
  ): RunningMount | undefined => {
    if (!host.runsMounts) return undefined
    const mountScope = Scope.forkUnsafe(renderer.scope, "sequential")
    const causedBy = origin
    const running: RunningMount = { scope: mountScope, mount, args: undefined, cutBy: undefined }
    // A mount that never reads its args' changes pays nothing for them. What keeps them is the mount's
    // own, so an app that issues no mount ships none of it.
    const changes = Stream.suspend(() => {
      const kept = running.mount["~args"]
      let args = running.args
      if (args === undefined) {
        const made = args = running.args = kept.make(running.mount.args)
        addFinalizer(mountScope, Effect.sync(() => kept.close(made)))
      }
      return kept.changes(args)
    })
    afterCommit(() =>
      whenReady(env, (envCtx) => {
        // A detached child's element starts its mount when the child is attached.
        if (inst.closed || isClosed(mountScope) || isParked(node)) return
        const { args, argsSchema, name } = running.mount
        const started = record(inst, { _tag: "MountStarted", name, args, argsSchema }, causedBy)
        let silent: boolean | undefined
        const send = (result: unknown) =>
          Effect.sync(() => {
            // The latest render's map, so what it closes over is current.
            const latest = running.mount
            const message = latest.resolve(result as never)
            const noop = isNoop(message)
            silent = noop && silent !== false
            if (noop) return
            inst.dispatch(message, {
              _tag: "Mount",
              seq: started,
              name: latest.name,
              args: latest.args,
              argsSchema: latest.argsSchema
            })
          })
        const fiber = forkNow(
          withCache(Context.add(Context.add(envCtx, Scope.Scope, mountScope), services.Refs, refsOf(inst))),
          Effect.suspend(() => mount.run(node, args, changes, send))
        )
        interruptOnClose(mountScope, fiber)
        fiber.addObserver((exit) =>
          step(() => {
            const failure = Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause) ? exit.cause : undefined
            // A later finalizer can hold the close open while the body returns before its interrupt.
            const reason = failure !== undefined
              ? "failed"
              : Exit.isSuccess(exit) && !isClosed(mountScope)
              ? "completed"
              : "closed"
            // The body can exit inside another step, such as the one whose close interrupted it. Its
            // end starts its own: only an element's removal gives it a cause, and a failure follows it.
            under(reason === "closed" ? running.cutBy : undefined, () => {
              record(inst, { _tag: "MountEnded", name, started, reason, silent: silent === true })
              if (failure !== undefined) failInstance(inst, failure, "mount", name)
            }, true)
          })
        )
      })
    )
    return running
  }

  /**
   * A patch gives a running mount the mount its element now renders with, issued by the same
   * definition: its map, and its args, published when they differ by the args Schema's equivalence.
   */
  const updateMount = (running: RunningMount, mount: View.Mount<any>) => {
    const previous = running.mount
    if (previous === mount) return
    running.mount = mount
    if (running.args === undefined || previous["~sameArgs"](mount)) return
    mount["~args"].publish(running.args, mount.args)
  }

  // -- owned layers ---------------------------------------------------------
  const ownerInstance = (inst: Instance, owner: View.Owner): Instance => {
    const found = owners.get(owner)
    if (found === undefined || found.closed) {
      throw new Error(inst.path + ": a part of " + owner.path + " was applied outside its view")
    }
    return found
  }

  /** The event options of every layer as one record: the host reads one value per event. */
  const mergeOptions = (
    inst: Instance,
    layers: ReadonlyArray<Pick<View.Owned, "eventOptions">>
  ): Readonly<Record<string, View.EventOptions>> => {
    const out: Record<string, Record<string, unknown>> = {}
    for (const { eventOptions: options } of layers) {
      for (const event in options) {
        const merged = out[event] ??= {}
        const option = options[event] as Readonly<Record<string, unknown>>
        for (const key in option) {
          const value = option[key]
          if (value === undefined) continue
          if (key === "preventDefault") {
            // `"always"` from any layer wins, then `true` from any: `fireLayered` still cancels only for a
            // message from a layer that set `true`, so another layer's `false` can't take that away.
            if (value === "always" || (merged[key] !== "always" && merged[key] !== true)) merged[key] = value
          } else if (key in merged) {
            throw new Error(inst.path + ": two owners set the " + key + " option of " + event + " on one element")
          } else {
            merged[key] = value
          }
        }
      }
    }
    return out
  }

  /**
   * Gives the host an element's events. With only the author's layer the handlers go as they are.
   * With owned layers, each event gets one `Layered` value, which the host hands back to `fireLayered`.
   */
  const setEvents = (inst: Instance, node: unknown, view: View.Element<any, any>) => {
    const author = inst.author
    if (view.owned === undefined || view.owned.length === 0) {
      return host.setEvents(node, view.handlers, author.fire, view.eventOptions)
    }
    // Deepest owner first, and the author last.
    const owned = view.owned.length === 1
      ? view.owned
      : view.owned.slice().sort((a, b) => b.owner.depth - a.owner.depth)
    const handlers: Record<string, Layered> = {}
    const add = (target: Instance, layer: Pick<View.Owned, "handlers" | "eventOptions">) => {
      for (const event in layer.handlers) {
        ;(handlers[event] ??= new Layered()).layers.push({
          inst: target,
          handler: layer.handlers[event]!,
          prevents: layer.eventOptions[event]?.preventDefault === true
        })
      }
    }
    for (const layer of owned) add(ownerInstance(inst, layer.owner), layer)
    add(author, view)
    host.setEvents(node, handlers as any, fireLayered, mergeOptions(inst, [...owned, view]))
  }

  const fireLayered: Renderer.Dispatch = (event, handler, payload, onMessage) => {
    let told = false
    for (const layer of (handler as unknown as Layered).layers) {
      const target = layer.inst
      if (target.closed || target.waiting) continue
      const own = layer.handler
      const message = typeof own === "function"
        ? guard(target, "domEvent", () => (own as (payload: unknown) => unknown)(payload), event)
        : own
      if (message === undefined) continue
      if (layer.prevents && !told) {
        told = true
        onMessage?.()
      }
      target.dispatch(message, { _tag: "DomEvent", name: event })
    }
  }

  const startOwnedMounts = (
    inst: Instance,
    view: View.Element<any, any>,
    node: unknown,
    env: Env,
    running?: ReadonlyArray<OwnedMount> | undefined
  ): ReadonlyArray<OwnedMount> | undefined => {
    const owned = view.owned ?? none
    if (owned.length === 0 && running === undefined) return undefined
    const out: Array<OwnedMount> = []
    for (const layer of owned) {
      const mount = layer.mount
      if (mount === undefined) continue
      const kept = running?.find((entry) => entry.owner === layer.owner && entry.name === mount.name)
      if (kept?.running !== undefined) updateMount(kept.running, mount)
      out.push(
        kept ??
          {
            owner: layer.owner,
            name: mount.name,
            running: startMount(ownerInstance(inst, layer.owner), mount, node, env, inst)
          }
      )
    }
    // The part is no longer applied to the element, which stays: its mount ends here.
    if (running !== undefined) { for (const entry of running) if (!out.includes(entry)) stopMount(inst, entry.running) }
    return out.length === 0 ? undefined : out
  }

  /** Ends a mount of an element `under` rendered: its Scope is forked from `under`'s. */
  const stopMount = (under: Instance, running: RunningMount | undefined) => {
    if (running === undefined) return
    running.cutBy = origin
    closeUnder(under, running.scope)
  }

  /** Ends an element's mount and those of its owned layers. */
  const stopMounts = (under: Instance, rendered: RElement) => {
    stopMount(under, rendered.mount)
    if (rendered.ownedMounts !== undefined) {
      for (const entry of rendered.ownedMounts) stopMount(under, entry.running)
    }
  }

  /** The element's mount after a patch: kept for the same definition, else stopped and started anew. */
  const patchMount = (
    inst: Instance,
    rendered: RElement,
    mount: View.Mount<any> | undefined,
    env: Env
  ): RunningMount | undefined => {
    const running = rendered.mount
    if (running !== undefined && mount !== undefined && running.mount.name === mount.name) {
      updateMount(running, mount)
      return running
    }
    stopMount(inst, running)
    return mount === undefined ? undefined : startMount(inst.author, mount, rendered.node, env, inst)
  }

  // -- create ---------------------------------------------------------------
  /** The instance's view. A headless instance's is the closure it was declared with, run against its parts. */
  const viewOf = (inst: Instance): View.Node<any, any> | undefined => {
    const owner = inst.owner
    if (owner === undefined) return guard(inst, "view", ownView)
    const parts = guard(inst, "view", () => ({
      value: (inst.component as unknown as Component.Headless.Any).parts(inst.model, inst.props, {
        owner,
        running: runningOf(inst),
        queries: inst.results,
        shared: sharedOf(inst)
      })
    }))
    if (parts === undefined) return undefined
    // A closure is the consumer's code: what goes wrong in it is logged as `content`.
    return guard(inst, "content", () => checked(inst, View.toNode(inst.content!(parts.value))))
  }

  const ownView = (inst: Instance): View.Node<any, any> => {
    const component = inst.component
    // Read once: the view the path is chosen for is the one called.
    const view = component.view
    // A view that `make` built reads the path only for `h.id`. Any other is given the path itself.
    const path = View.takesPathSource(view) ? inst : inst.path
    // Called on its component, as a hand-written view method may read `this`. Not through its own `call`,
    // which a decorated function can replace.
    return checked(
      inst,
      Reflect.apply(view, component, [
        inst.model,
        inst.props,
        runningOf(inst),
        inst.results,
        path,
        sharedOf(inst),
        inst
      ])
    )
  }

  /** Checks a fresh view's child paths, which its fallbacks are checked against as they're shown. */
  const checked = (inst: Instance, tree: View.Node<any, any>): View.Node<any, any> => {
    // The tree it rendered last, when that held no child, as `inst.childPaths` found: only a view that
    // used `h.lazy` gives its nodes again, so only its tree is worth comparing.
    const last = inst.lazy !== undefined && inst.childPaths === undefined && inst.rendered.length === 1
      ? inst.rendered[0]!
      : undefined
    const paths = checkChildPaths(inst, tree, last?._tag === "Element" ? last.v : undefined)
    // A view with no child, ref or outlet has nothing to check its fallbacks or refs against.
    inst.childPaths = paths.paths === undefined && paths.refs === undefined && paths.placed === undefined
      ? undefined
      : paths
    inst.clash = undefined
    // Its author's refs are checked once the author's other trees are current too.
    if (inst.owner !== undefined) refChecks.add(inst.author)
    return tree
  }

  /**
   * Authors with a closure rendered since their refs were last checked: one that mounted, or that
   * rendered alone, as a headless child does when its own Model changes.
   */
  const refChecks = new Set<Instance>()
  /**
   * Fails `author` with source `view` when two children across its view and the closures it wrote have
   * refs with one key, since a send matches a child by its key alone. Run once all of them are current.
   */
  const checkRefs = (author: Instance) => {
    refChecks.delete(author)
    if (author.closed) return
    const written: Array<ChildPaths> = author.childPaths === undefined ? [] : [author.childPaths]
    closurePaths(author, written)
    try {
      checkAuthorRefs(author, written)
      checkAuthorPlacements(author, written)
    } catch (error) {
      failInstance(author, Cause.die(error), "view")
    }
  }
  /**
   * Adds the paths of the trees below `inst` that its author wrote: the closures of its headless
   * children and the content its children place, at any depth. Only what's still in the tree counts,
   * since a removed child's Scope can close later.
   */
  const closurePaths = (inst: Instance, out: Array<ChildPaths>) => {
    for (const child of inst.children) {
      if (child.closed) continue
      if (child.owner === undefined) {
        firstInOutlets(child, (placed) => {
          if (placed.childPaths !== undefined) out.push(placed.childPaths)
          closurePaths(placed, out)
          return undefined
        })
        continue
      }
      if (child.childPaths !== undefined) out.push(child.childPaths)
      closurePaths(child, out)
    }
  }
  const checkPendingRefs = () => {
    for (const author of refChecks) checkRefs(author)
  }

  /**
   * Hydration: the latest placement a parent rendered for an instance while it waited to adopt, applied once
   * it has. One that unmounts first never reads it.
   */
  const heldPlacement = new WeakMap<Instance, View.Child<any, any>>()
  /** Writes a placement's slots and a headless child's closure, and returns the instance's slots. */
  const setPlacement = (inst: Instance, child: View.Child<any, any>): Slotted | undefined => {
    const slotted = slottedBy.get(inst)
    if (slotted !== undefined) slotted.values = child.slots
    if (inst.owner !== undefined) inst.content = child.view
    return slotted
  }
  /** A held placement, applied: slots, a headless child's closure, and new props as `changeProps` does. */
  const applyPlacement = (inst: Instance, child: View.Child<any, any>) => {
    const slotted = setPlacement(inst, child)
    if (!propsEqual(child.props, inst.props)) changeProps(inst, child.props)
    if (inst.closed) return
    markDirty(inst)
    if (slotted !== undefined) refreshOutlets(slotted)
  }
  /** New props from the parent: written to the log, then the watches, keyed queries and shares follow them. */
  const changeProps = (inst: Instance, props: unknown) => {
    inst.props = props
    if (inst.selection !== undefined) inst.selection.due = true
    // Before the result writes the new props cause, so a replay opens them against these props.
    const changedSeq = record(inst, { _tag: "PropsChanged", props })
    // Watches first: new args over a settled entry write its value before this render, and the
    // keyed queries' results are written before it too.
    syncSubscriptions(inst)
    drainKeyed(inst)
    if (!inst.closed) refreshShares(inst, changedSeq)
  }

  const render = (inst: Instance) => {
    if (inst.component === outletComponent) return renderOutlet(inst)
    if (inst.waiting) return
    reselect(inst)
    if (inst.closed) return
    const tree = viewOf(inst)
    if (tree === undefined) return
    guard(inst, "view", () => {
      const parentNode = host.parentOf(firstNodeOfList(inst.rendered))!
      const ref = host.nextOf(lastNodeOfList(inst.rendered))
      releaseRemoved(inst.rendered, [tree])
      const before = inst.rendered
      const next = patchList(inst, parentNode, before, [tree], ref, inst.env)
      if (inst.rendered === before) inst.rendered = next
      else {
        // Failed while rendering, as when a fallback in its tree throws: `close` left the placeholder,
        // which stays, and what the patch built goes.
        for (const node of next.flatMap(nodesOf)) host.remove(node)
      }
      throwClash(inst)
    })
    // Its closures render with it, so all it wrote is current. A closure that rendered alone is checked
    // in the drain, after the render that holds it.
    if (inst.owner === undefined) checkRefs(inst)
    if (!inst.closed) viewChanged = true
    deliverSends(inst)
  }

  /** The record of an element whose node and children are made: its mounts start now. */
  const renderedElement = (
    inst: Instance,
    view: View.Element<any, any>,
    node: unknown,
    children: Rendered | Array<Rendered> | undefined,
    env: Env
  ): RElement => {
    const rendered: RElement = new ElementRecord(view, node, children)
    if (view.mount !== undefined) rendered.mount = startMount(inst.author, view.mount, node, env, inst)
    if (view.owned !== undefined && view.owned.length > 0) {
      const owned = startOwnedMounts(inst, view, node, env)
      if (owned !== undefined) rendered.ownedMounts = owned
    }
    return rendered
  }

  const create = (inst: Instance, view: View.Node<any, any>, env: Env): Rendered => {
    switch (view._tag) {
      case "Text":
        return new TextRecord(view, host.createText(view.text))
      case "Element": {
        const node = host.createElement(view.tag)
        const attrs = view.attrs
        if (attrs !== View.noFields) { for (const name in attrs) host.setAttr(node, name, attrs[name]) }
        setEvents(inst, node, view)
        const views = view.children
        let children: Rendered | Array<Rendered> | undefined
        // The element is new and empty, so its children go in as they are made, without reading the host.
        if (views.length === 1) {
          insertNodes(node, children = create(inst, views[0]!, env), undefined)
        } else if (views.length > 0) {
          checkKeys(inst, views)
          children = new Array(views.length)
          for (let index = 0; index < views.length; index++) {
            insertNodes(node, children[index] = create(inst, views[index]!, env), undefined)
          }
        }
        // Properties go after the children, so a `select`'s `value` has its options to match.
        const props = view.props
        if (props !== View.noFields) { for (const name in props) host.setProp(node, name, props[name]) }
        return renderedElement(inst, view, node, children, env)
      }
      case "Child":
        return createChild(inst, view, env)
      case "Outlet":
        return createOutlet(inst, view)
    }
  }

  // -- outlets ----------------------------------------------------------------
  const outletComponent: Component.Any = {
    definition: { name: "[outlet]", slots: [] },
    head: undefined,
    reduceHead: undefined,
    subscriptions: undefined,
    layer: undefined,
    "~queries": undefined,
    elements: () => undefined
  } as any

  /**
   * Places the slot `view` names, in the tree `inst` renders. Its receiver is the author of that tree,
   * the outlet instance's parent is `inst`, so the content lives as long as `inst` places it, and its
   * author is whoever wrote the content.
   */
  const createOutlet = (inst: Instance, view: View.Outlet, range?: Range): ROutlet => {
    const out = makeOutlet(inst, view)
    const views = checkedViews(out)
    try {
      if (range !== undefined) {
        // The markers go, and the server's nodes that match are the content's.
        out.rendered = adoptList(out, views, host.nextOf(range.open), range.close, out.env)
        host.remove(range.open)
        host.remove(range.close)
      } else {
        const rendered: Array<Rendered> = new Array(views.length)
        for (let index = 0; index < views.length; index++) rendered[index] = create(out, views[index]!, out.env)
        out.rendered = rendered
      }
    } catch (error) {
      contentFailed(out, error)
      out.rendered = [new TextRecord(emptyText, host.createText(""))]
    }
    failClash(out)
    if (inst.children === noChildren) inst.children = new Set()
    inst.children.add(out)
    return { _tag: "Outlet", v: view, inst: out }
  }

  const makeOutlet = (parent: Instance, view: View.Outlet): Instance => {
    const receiver = parent.author
    const slotted = slottedBy.get(receiver)
    if (slotted === undefined) throw new Error(`${receiver.path} places the slot ${view.name}, and declares no slots`)
    // Who wrote the content: the author of the tree the receiver's child node sits in.
    const author = receiver.parent === undefined ? receiver : receiver.parent.author
    const name = view.name
    const out: Instance = new Inst(
      outletPath(receiver, name),
      "",
      parent.depth + 1,
      outletComponent,
      parent,
      undefined,
      Scope.forkUnsafe(parent.scope, "sequential"),
      slotted.env,
      undefined,
      ignoreEvents,
      undefined,
      undefined,
      author
    )
    // The content's children adopt the server's state when the instance placing it and the one that
    // wrote it both did.
    out.adoptsChildren = parent.adoptsChildren && author.adoptsChildren
    outletOf.set(out, { slotted, view, content: undefined })
    slotted.placed.set(name, out)
    scopeAddFinalizerUnsafe(out.scope, out, () => {
      dirty.delete(out)
      if (slotted.placed.get(name) === out) slotted.placed.delete(name)
      return Effect.void
    })
    return out
  }

  const outletPath = (receiver: Instance, name: string): string => receiver.path + "/" + slotSegment(name)

  /** What the receiver's parent last passed for the outlet's slot. */
  const contentOf = (outlet: OutletOf): unknown => outlet.slotted.values?.[outlet.view.name]

  /** Whether the outlet has to render: it was marked to, or its content isn't what it last rendered. */
  const isStale = (out: Instance, outlet: OutletOf): boolean => dirty.has(out) || outlet.content !== contentOf(outlet)

  /**
   * The nodes an outlet shows: its slot's content, once it passes the checks the reconcile can make
   * before it builds them, or one empty text node. A content that fails a check shows nothing, and
   * fails its author.
   */
  const checkedViews = (out: Instance): Array<View.Node<any, any>> => {
    const outlet = outletOf.get(out)!
    const content = outlet.content = contentOf(outlet)
    try {
      let views = content === undefined ? [] : View.children([content as View.Input<any, any>])
      const noText = outlet.view.noText
      if (noText !== undefined) {
        if (views.some((node) => node._tag === "Text")) throw new Error(out.path + ": " + noText)
        // A forwarded slot sits where this one does, so its content can't hold text either.
        views = views.map((node) =>
          node._tag === "Outlet" && node.noText !== noText ? { _tag: "Outlet", name: node.name, noText } : node
        )
      }
      out.childPaths = checkContentPaths(out, views)
      out.clash = undefined
      checkKeys(out, views)
      // The author's refs are checked once its other trees are current too.
      refChecks.add(out.author)
      return views.length === 0 ? [emptyText] : views
    } catch (error) {
      contentFailed(out, error)
      out.childPaths = undefined
      return [emptyText]
    }
  }

  /**
   * A content is its author's code, so a mistake in it fails the author. Deferred, as a fallback clash
   * is: failing an ancestor midway through a patch would close it over nodes the patch has removed.
   */
  const contentFailed = (out: Instance, error: unknown) => {
    const author = out.author
    defer(() => failInstance(author, Cause.die(error), "view"))
  }

  const renderOutlet = (out: Instance) => {
    dirty.delete(out)
    const views = checkedViews(out)
    try {
      const parentNode = host.parentOf(firstNodeOfList(out.rendered))!
      const ref = host.nextOf(lastNodeOfList(out.rendered))
      releaseRemoved(out.rendered, views)
      out.rendered = patchList(out, parentNode, out.rendered, views, ref, out.env)
    } catch (error) {
      contentFailed(out, error)
    }
    failClash(out)
  }

  /** A fallback in the content that clashed with its paths fails the content's author, as `throwClash` fails a view's. */
  const failClash = (out: Instance) => {
    const clash = out.clash
    if (clash === undefined) return
    out.clash = undefined
    contentFailed(out, clash)
  }

  /** Re-renders the placed outlets whose content the parent changed. */
  const refreshOutlets = (slotted: Slotted) => {
    for (const out of slotted.placed.values()) {
      if (!out.closed && isStale(out, outletOf.get(out)!)) renderOutlet(out)
    }
  }

  /** A declared child, detached if its view says so. */
  const createChild = (inst: Instance, view: View.Child<any, any>, env: Env, range?: Range): Rendered => {
    const made = makeChild(inst, view, env, range)
    return view.detached ? detach(inst, made) : made
  }

  const makeChild = (
    inst: Instance,
    view: View.Child<any, any>,
    env: Env,
    range?: Range
  ): RChild | RFallback => {
    const target = view.component
    const status = env.status
    if (Feature.isService(target) && status._tag !== "Ready") {
      // The feature's service comes from a Layer that is still building, or failed. The child shows
      // `fallback`, rendered against the nearest settled Env, and re-renders when the Layer settles.
      if (view.fallback === undefined) {
        throw new Error(
          `${inst.path}: ${target.key} isn't available, because a Layer above it is still building or failed. Pass \`fallback\` to the feature's \`render\`.`
        )
      }
      if (status._tag !== "Failed") {
        const rerender = () => {
          if (!inst.closed) markDirty(inst)
        }
        whenReady(env, rerender, rerender)
      }
      return fallbackSlot(inst, view, status, false, env, range)
    }
    let component: Component.Any
    let childEnv = env
    if (Feature.isService(target)) {
      const found = Context.getOption(env.ctx!, target)
      if (Option.isNone(found)) throw new Error(`${inst.path}: nothing provides ${target.key}`)
      component = found.value.component
      // The Context that closed the implementation's requirements wins over the mount position's.
      childEnv = readyEnv(Context.merge(env.ctx!, found.value.context), env)
    } else {
      component = target
    }
    const headless = (component as unknown as Component.Headless.Any).parts !== undefined
    if (headless !== (view.view !== undefined)) {
      throw new Error(
        headless
          ? inst.path + ": " + component.definition.name + " is headless, so declaring it as a child needs a view"
          : inst.path + ": " + component.definition.name + " has its own view, so declaring it as a child takes none"
      )
    }
    const child = makeInstance(
      component,
      view.props,
      // A feature's segment names the feature, not the component that implements it.
      component === target ? undefined : `${inst.path}/${segment(view)}`,
      view.key,
      inst,
      childEnv,
      view.onEmit,
      view.onFailure,
      range,
      view.view,
      view.slots
    )
    // Built fresh: the server's nodes go, and the parent places the new ones.
    if (range !== undefined && !range.claimed) removeRange(range)
    if (child.failure !== undefined) {
      // Failed while mounting: the child shows its fallback in the placeholder's place.
      const nodes = child.rendered.flatMap(nodesOf)
      for (const node of nodes) host.remove(node)
      return failedChild(inst, view, child.failure, env)
    }
    // A set of the instances, not a map by path: a path is a string made for each child, and hashing
    // it would cost more than anything else here.
    if (inst.children === noChildren) inst.children = new Set()
    inst.children.add(child)
    return new ChildRecord(view, child)
  }

  /**
   * A fallback's children are `inst`'s, so their paths are checked against the render's other
   * children and fallbacks. Outside the `fallback` guard: a clash fails `inst` with source `view`, as
   * one in its view does.
   */
  const shownIn = (inst: Instance, view: View.Child<any, any>, node: View.Node<any, any>): View.Node<any, any> => {
    if (inst.childPaths === undefined) return node
    try {
      checkFallbackPaths(inst.childPaths, view, node)
      return node
    } catch (error) {
      // Thrown midway through a patch, it would close the instance over nodes the patch has
      // already removed, so it waits for the render to finish.
      inst.clash ??= error
      return emptyText
    }
  }

  /** Fails the render with the first fallback clash, once its nodes are in place. */
  const throwClash = (inst: Instance) => {
    const clash = inst.clash
    if (clash === undefined) return
    inst.clash = undefined
    throw clash
  }

  /**
   * What a slot shows for a status other than `Ready`: its `fallback` of that status. Only a failed
   * child's slot may have none, and shows nothing. A fallback that throws fails its author, who wrote
   * the tree it sits in, with source `fallback`.
   */
  const fallbackOf = (
    inst: Instance,
    view: View.Child<any, any>,
    status: Status,
    failedChild: boolean
  ): View.Node<any, any> =>
    shownIn(
      inst,
      view,
      guard(inst.author, "fallback", () =>
        failedChild && view.fallback === undefined ? emptyText : View.toNode(view.fallback!(resultOf(status)))) ??
        emptyText
    )

  const failedChild = (
    inst: Instance,
    view: View.Child<any, any>,
    failure: Cause.Cause<unknown>,
    env: Env
  ): RFallback => fallbackSlot(inst, view, { _tag: "Failed", cause: failure }, true, env, undefined)

  /**
   * A slot showing its `fallback` for `status`. Given the server's range, it adopts the server's
   * nodes when the server recorded the same status there and the fallback matches them, and otherwise
   * replaces them.
   */
  const fallbackSlot = (
    inst: Instance,
    view: View.Child<any, any>,
    status: Status,
    failedChild: boolean,
    env: Env,
    range: Range | undefined
  ): RFallback => {
    const shown = fallbackOf(inst, view, status, failedChild)
    let inner: Rendered | undefined
    if (range !== undefined) {
      if (shippedStatus(`${inst.path}/${segment(view)}`) === status._tag) {
        inner = adoptNode(inst, shown, host.nextOf(range.open), range.close, settled(env))
      }
      if (inner !== undefined) claim(range)
      else removeRange(range)
    }
    return { _tag: "Fallback", v: view, inner: inner ?? create(inst, shown, settled(env)), status, failedChild }
  }

  // -- hydration ------------------------------------------------------------
  /** The range that starts at `open`, the marker for `path`, up to its closing marker, looked for before `stop`. */
  const rangeFrom = (open: unknown, path: string, stop: unknown): Range | undefined => {
    for (let node = host.nextOf(open); node !== undefined && node !== stop; node = host.nextOf(node)) {
      const kind = hydration!.inspect(node)
      if (kind._tag === "Close" && kind.path === path) return { open, close: node, claimed: false }
    }
    return undefined
  }

  /** A range's nodes, its markers included. */
  const rangeNodes = (range: Range): Array<unknown> => {
    const out: Array<unknown> = []
    for (let node = range.open; node !== range.close; node = host.nextOf(node)) out.push(node)
    out.push(range.close)
    return out
  }

  const removeRange = (range: Range) => {
    removeUpTo(range.open, range.close)
    host.remove(range.close)
  }

  /** Removes `node` and the siblings after it, up to `stop`. */
  const removeUpTo = (node: unknown, stop: unknown) => {
    while (node !== undefined && node !== stop) {
      const next = host.nextOf(node)
      host.remove(node)
      node = next
    }
  }

  // The server's node after what `adoptNode` last adopted.
  let adoptedUpTo: unknown

  /** Adopted: what's left of the server's nodes in the range goes, with its markers. */
  const claim = (range: Range) => {
    range.claimed = true
    removeUpTo(adoptedUpTo, range.close)
    host.remove(range.open)
    host.remove(range.close)
  }

  /**
   * Adopts the server's node `node` for `view`, with everything under it, in one pass: nothing is
   * matched ahead. `undefined` when `node`, which is `stop` or missing once the server's nodes run out,
   * isn't what the view renders: nothing was adopted then. A child matches by its marker range, which it
   * adopts itself. A server never writes an empty text node, so an empty text takes no node and is created.
   */
  const adoptNode = (
    inst: Instance,
    view: View.Node<any, any>,
    node: unknown,
    stop: unknown,
    env: Env
  ): Rendered | undefined => {
    const kind = node === undefined || node === stop ? undefined : hydration!.inspect(node)
    switch (view._tag) {
      case "Text": {
        if (kind?._tag === "Text") {
          if (kind.text !== view.text) return undefined
          adoptedUpTo = host.nextOf(node)
          return new TextRecord(view, node)
        }
        if (view.text !== "") return undefined
        adoptedUpTo = node
        return new TextRecord(view, host.createText(""))
      }
      case "Element": {
        if (kind?._tag !== "Element" || kind.tag !== view.tag) return undefined
        const next = host.nextOf(node)
        for (const name in view.attrs) {
          if (hydration!.getAttr(node, name) !== view.attrs[name]) host.setAttr(node, name, view.attrs[name])
        }
        setEvents(inst, node, view)
        checkKeys(inst, view.children)
        // Content the host parses as text has no nodes or markers to adopt, so its children are built fresh.
        const children = adoptList(
          inst,
          view.children,
          kind.textOnly === true ? undefined : hydration!.firstChild(node),
          undefined,
          env
        )
        if (kind.textOnly === true) removeUpTo(hydration!.firstChild(node), undefined)
        placeEach(node, children, undefined)
        for (const name in view.props) adoptProp(node, name, view.props[name])
        adoptedUpTo = next
        return renderedElement(inst, view, node, packed(children), env)
      }
      case "Child":
      case "Outlet": {
        const path = view._tag === "Child" ? `${inst.path}/${segment(view)}` : outletPath(inst.author, view.name)
        if (kind?._tag !== "Open" || kind.path !== path) return undefined
        const range = rangeFrom(node, path, stop)
        if (range === undefined) return undefined
        const next = host.nextOf(range.close)
        // A child's content matches itself against the range, as an outlet's does, and builds fresh what doesn't.
        const made = view._tag === "Child" ? createChild(inst, view, env, range) : createOutlet(inst, view, range)
        adoptedUpTo = next
        return made
      }
    }
  }

  /**
   * Adopts the server's nodes from `first` up to `stop` for `views`, one by one. From the first that doesn't
   * match, the server's nodes go and the views left are built fresh: what was adopted before it stays.
   * A matching element therefore survives a mismatch among its children. This is kernel-specific:
   * callers of the default runtime must not rely on node identity in a mismatched instance.
   */
  const adoptList = (
    inst: Instance,
    views: ReadonlyArray<View.Node<any, any>>,
    first: unknown,
    stop: unknown,
    env: Env
  ): Array<Rendered> => {
    const out: Array<Rendered> = new Array(views.length)
    let node = first
    let index = 0
    for (; index < views.length; index++) {
      const made = adoptNode(inst, views[index]!, node, stop, env)
      if (made === undefined) break
      out[index] = made
      node = adoptedUpTo
    }
    removeUpTo(node, stop)
    for (; index < views.length; index++) out[index] = create(inst, views[index]!, env)
    return out
  }

  // -- diff -----------------------------------------------------------------
  const duplicateKey = (inst: Instance, key: string): Error =>
    new Error(`${inst.path}: two siblings share the key ${key.slice(2)}`)

  /**
   * Throws when two keyed elements in `views` have one key. Every list of siblings is checked as
   * it is made, so the olds of a patch never share a key. Children aren't checked here: each
   * view's are checked by their paths, across the whole view, before it renders.
   */
  const checkKeys = (inst: Instance, views: ReadonlyArray<View.Node<any, any>>): void => {
    let seen: Set<string> | undefined
    for (let index = 0; index < views.length; index++) {
      const view = views[index]!
      if (view._tag !== "Element" || view.elementKey === undefined) continue
      const key = keyOf(view)
      if ((seen ??= new Set()).has(key)) throw duplicateKey(inst, key)
      seen.add(key)
    }
  }

  /**
   * Keyed olds from `start` up to `end` by key, with their index. `undefined` when every one of them
   * is matched by position.
   */
  const keyedIndex = (olds: ReadonlyArray<Rendered>, start: number, end: number): Map<string, number> | undefined => {
    let byKey: Map<string, number> | undefined
    for (let index = start; index < end; index++) {
      const view = olds[index]!.v
      if (isKeyed(view)) (byKey ??= new Map()).set(keyOf(view), index)
    }
    return byKey
  }

  /** Whether `view` patches `rendered` once matched with it. */
  const same = (rendered: Rendered, view: View.Node<any, any>): boolean => match.same(rendered.v, view)

  /**
   * Whether `view` is matched with `rendered` when both are at one index: an unkeyed node with an
   * unkeyed old of its kind, and a keyed node with the old that has its key. What the keys' strings
   * would decide, without building them.
   */
  const pairs = (rendered: Rendered, view: View.Node<any, any>): boolean => {
    switch (view._tag) {
      case "Text":
        return rendered._tag === "Text"
      case "Element":
        return rendered._tag === "Element" && rendered.v.tag === view.tag && rendered.v.elementKey === view.elementKey
      case "Child":
        return (rendered._tag === "Child" || rendered._tag === "Fallback" || rendered._tag === "Detached") &&
          rendered.v.component === view.component && rendered.v.key === view.key
      case "Outlet":
        return rendered._tag === "Outlet" && rendered.v.name === view.name
    }
  }

  /**
   * Matches `news` against `olds`: a keyed node by its key, any other by its position, against an
   * old there that isn't keyed. Matched nodes are patched, the rest created, and the olds left over
   * destroyed, in their order.
   *
   * Most lists keep their nodes where they were, so the nodes at the start that still match the old
   * at their index are patched first, and a list that kept all of them is returned as it is. Keyed
   * nodes at the end that match from the end are paired the same way. Only what's between them is
   * matched through a map of keys, so a row added or removed in a long list builds none.
   */
  /** The keys of the keyed elements in `news` before `end`. */
  const elementKeys = (news: ReadonlyArray<View.Node<any, any>>, end: number): Set<string> => {
    const keys = new Set<string>()
    for (let index = 0; index < end; index++) {
      const view = news[index]!
      if (view._tag === "Element" && view.elementKey !== undefined) keys.add(keyOf(view))
    }
    return keys
  }

  const patchList = (
    inst: Instance,
    parentNode: unknown,
    olds: Array<Rendered>,
    news: ReadonlyArray<View.Node<any, any>>,
    ref: unknown,
    env: Env
  ): Array<Rendered> => {
    const oldLength = olds.length
    const newLength = news.length
    if (oldLength === 0) {
      if (newLength === 0) return olds
      // Nothing to match: every node is new.
      return createList(inst, parentNode, news, ref, env)
    }
    const shared = oldLength < newLength ? oldLength : newLength
    let start = 0
    // Whether an old before `start` is keyed: a list with keyed nodes can change order.
    let keyedBefore = false
    // A child at `start` that changed what it shows, so its nodes may not be placed yet.
    let replaced: Rendered | undefined
    while (start < shared) {
      const old = olds[start]!
      const view = news[start]!
      // What `pairs` and `patch` do, for the two kinds most nodes are.
      if (view._tag === "Element") {
        if (old._tag !== "Element" || old.v.tag !== view.tag || old.v.elementKey !== view.elementKey) break
        if (view.elementKey !== undefined) keyedBefore = true
        patchElement(inst, old, view, env)
      } else if (view._tag === "Text") {
        if (old._tag !== "Text") break
        if (view.text !== old.v.text) host.setText(old.node, view.text)
        old.v = view
      } else {
        if (!pairs(old, view)) break
        keyedBefore = true
        const next = patch(inst, old, view, env)
        if (next !== old) {
          replaced = next
          break
        }
      }
      start++
    }
    if (replaced === undefined && start === newLength) {
      if (start === oldLength) return olds
      // The list only got shorter: the olds left over go, and the rest stay in place.
      if (start === 0) {
        destroyAll(inst, parentNode, olds)
        return []
      }
      for (let index = start; index < oldLength; index++) destroy(inst, olds[index]!)
      return olds.slice(0, start)
    }
    const result: Array<Rendered> = new Array(newLength)
    for (let index = 0; index < start; index++) result[index] = olds[index]!
    if (replaced === undefined && start === oldLength) {
      // The list only got longer: the olds stay in place, and the new nodes go after them.
      let seen: Set<string> | undefined
      for (let index = start; index < newLength; index++) {
        const view = news[index]!
        if (view._tag === "Element" && view.elementKey !== undefined) {
          const key = keyOf(view)
          if ((seen ??= elementKeys(news, start)).has(key)) throw duplicateKey(inst, key)
          seen.add(key)
        }
        result[index] = create(inst, view, env)
      }
      for (let index = start; index < newLength; index++) insertNodes(parentNode, result[index]!, ref)
      return result
    }
    // Where matching goes on from: after the nodes that stayed, and after a child that was replaced.
    const first = replaced === undefined ? start : start + 1
    // Keyed nodes at the end, matched with the keyed olds at the end. They are patched in their turn.
    let oldEnd = oldLength
    let newEnd = newLength
    if (replaced === undefined) {
      while (oldEnd > start && newEnd > start) {
        const view = news[newEnd - 1]!
        if (!isKeyed(view) || !pairs(olds[oldEnd - 1]!, view)) break
        oldEnd--
        newEnd--
      }
    }
    const byKey = keyedIndex(olds, first, oldEnd)
    const keyed = keyedBefore || byKey !== undefined || oldEnd < oldLength
    // The keys of the keyed elements that are new, and of those before `first`. A node matched
    // with an old has that old's key, and no two olds share one, so only a new element can have a
    // key a sibling has: the set is made for the first of them.
    let seen: Set<string> | undefined
    // Only keyed nodes can change order. Once a keyed list is out of order: each new node's old
    // index, or -1 if its nodes aren't in the host yet.
    let from: Int32Array | undefined
    let matched = start
    let inPlace = true
    let previous = start - 1
    if (replaced !== undefined) {
      if (keyed) from = orderSoFar(olds, result, start)
      inPlace = false
      if (from !== undefined) from[start] = -1
      result[start] = replaced
      matched++
      previous = start
    }
    for (let index = first; index < newLength; index++) {
      const view = news[index]!
      let at = -1
      if (index >= newEnd) {
        // Matched from the end.
        if (seen !== undefined && view._tag === "Element") {
          const key = keyOf(view)
          if (seen.has(key)) throw duplicateKey(inst, key)
        }
        at = index - newEnd + oldEnd
      } else if (isKeyed(view)) {
        const key = keyOf(view)
        const found = byKey?.get(key)
        // An old that a node took is marked, so a second node with its key is found out.
        if (found === taken) throw duplicateKey(inst, key)
        if (found !== undefined && same(olds[found]!, view)) {
          byKey!.set(key, taken)
          at = found
        } else if (view._tag === "Element") {
          if ((seen ??= elementKeys(news, first)).has(key)) throw duplicateKey(inst, key)
          seen.add(key)
        }
      } else if (index < oldLength && !isKeyed(olds[index]!.v) && same(olds[index]!, view)) {
        at = index
      }
      if (at === -1) {
        if (inPlace && keyed) from = orderSoFar(olds, result, index)
        inPlace = false
        if (from !== undefined) from[index] = -1
        result[index] = create(inst, view, env)
        continue
      }
      matched++
      const old = olds[at]!
      const next = patch(inst, old, view, env)
      // A child that changed what it shows has nodes that may not be placed yet.
      if (inPlace && (next !== old || at < previous)) {
        if (keyed) from = orderSoFar(olds, result, index)
        inPlace = false
      }
      if (from !== undefined) from[index] = next === old ? at : -1
      previous = at
      result[index] = next
    }
    if (matched === 0) {
      // Every old goes, before any new node is placed.
      destroyAll(inst, parentNode, olds)
    } else if (matched < oldLength) {
      // What wasn't matched: the keyed olds left in the map, and the olds at a position no node took.
      // A marked old isn't among them: `taken` is no index.
      const goneKeyed = byKey === undefined ? undefined : new Set(byKey.values())
      for (let index = first; index < oldEnd; index++) {
        const old = olds[index]!
        const gone = isKeyed(old.v)
          ? goneKeyed!.has(index)
          : !(index < newLength && !isKeyed(news[index]!) && same(old, news[index]!))
        if (gone) destroy(inst, old)
      }
    }
    if (!inPlace) place(parentNode, result, ref, from === undefined ? undefined : inOrder(from))
    return result
  }

  /** A list with no olds: each node is created and put before `ref`, in order. */
  const createList = (
    inst: Instance,
    parentNode: unknown,
    news: ReadonlyArray<View.Node<any, any>>,
    ref: unknown,
    env: Env
  ): Array<Rendered> => {
    checkKeys(inst, news)
    const result: Array<Rendered> = new Array(news.length)
    for (let index = 0; index < news.length; index++) result[index] = create(inst, news[index]!, env)
    // After all of them are made, so a list that throws part way puts nothing in the host.
    for (let index = 0; index < result.length; index++) insertNodes(parentNode, result[index]!, ref)
    return result
  }

  /**
   * The old indices of `result`'s first `upTo` nodes, while they were all kept, in order. The rest
   * of the list fills in the others.
   */
  const orderSoFar = (olds: ReadonlyArray<Rendered>, result: ReadonlyArray<Rendered>, upTo: number) => {
    const from = new Int32Array(result.length)
    let at = 0
    for (let index = 0; index < upTo; index++) {
      while (olds[at] !== result[index]) at++
      from[index] = at
    }
    return from
  }

  /**
   * The nodes that stay where they are when a list is reordered: the longest run of old indices in
   * increasing order. The others move around them, so a swap of two moves two. Built from the end,
   * so between runs as long, the one that starts first stays, as it did when `place` alone chose.
   */
  const inOrder = (from: Int32Array): Uint8Array => {
    const stays = new Uint8Array(from.length)
    // starts[length - 1]: the index of the largest old index that starts a run of that length.
    const starts = new Int32Array(from.length)
    const after = new Int32Array(from.length)
    let longest = 0
    for (let index = from.length - 1; index >= 0; index--) {
      const at = from[index]!
      if (at === -1) continue
      let low = 0
      let high = longest
      while (low < high) {
        const middle = (low + high) >>> 1
        if (from[starts[middle]!]! > at) low = middle + 1
        else high = middle
      }
      after[index] = low > 0 ? starts[low - 1]! : -1
      starts[low] = index
      if (low === longest) longest++
    }
    for (let index = longest > 0 ? starts[longest - 1]! : -1; index !== -1; index = after[index]!) stays[index] = 1
    return stays
  }

  /**
   * The patcher's pre-pass, run over an instance's whole tree before any of it is patched: what the
   * patch will remove lets go of its cache watchers, at any depth below the elements it keeps, before
   * anything new is created. It can't see what a kept child's own re-render removes, nor what another
   * instance rendered later in the pass removes. The cache hold each render pass runs under is what
   * makes the zero-to-one decision independent of that order.
   */
  const releaseRemoved = (olds: ReadonlyArray<Rendered>, news: ReadonlyArray<View.Node<any, any>>) => {
    // Nothing in the tree has watchers to let go of: the pass would do nothing.
    if (!holdsWatchers) return
    const byKey = keyedIndex(olds, 0, olds.length)
    const kept = new Set<Rendered>()
    for (let index = 0; index < news.length; index++) {
      const view = news[index]!
      const at = isKeyed(view)
        ? byKey?.get(keyOf(view))
        : index < olds.length && !isKeyed(olds[index]!.v)
        ? index
        : undefined
      const old = at === undefined ? undefined : olds[at]!
      if (old === undefined || !same(old, view) || kept.has(old)) continue
      kept.add(old)
      if (old._tag === "Element") releaseRemoved(listOf(old.children), (view as View.Element<any, any>).children)
    }
    for (const old of olds) if (!kept.has(old)) releaseRendered(old)
  }

  const patchProps = (
    node: unknown,
    prev: Readonly<Record<string, unknown>>,
    next: Readonly<Record<string, unknown>>
  ) => {
    // Neither sets a property, as for most elements.
    if (next === View.noFields && prev === View.noFields) return
    for (const name in prev) {
      if (!(name in next)) host.setProp(node, name, undefined)
    }
    for (const name in next) {
      // A controlled property is re-applied: the user may have changed the live value since.
      if (prev[name] !== next[name] || controlled.has(name)) host.setProp(node, name, next[name])
    }
  }

  /**
   * Sets what changed between two attribute records: the names that went first, then the values
   * that differ. A record's own values are strings, which nothing it inherits from
   * `Object.prototype` is, so a name is looked up by reading it.
   */
  const patchAttrs = (
    node: unknown,
    prev: Readonly<Record<string, string>>,
    next: Readonly<Record<string, string>>
  ) => {
    if (host.normalizeAttrs !== undefined) {
      prev = host.normalizeAttrs(node, prev)
      next = host.normalizeAttrs(node, next)
    }
    for (const name in prev) {
      if (typeof next[name] !== "string") host.setAttr(node, name, undefined)
    }
    for (const name in next) {
      const value = next[name]
      if (prev[name] !== value) host.setAttr(node, name, value)
    }
  }

  /**
   * When a rendered element holds only elements and text, how many of them set a property: -1 when it
   * holds anything else.
   */
  const plainTree = (rendered: RElement): number => {
    let props = rendered.v.props === View.noFields ? 0 : 1
    const children = rendered.children
    if (children === undefined) return props
    const one = !Array.isArray(children)
    for (let i = 0, length = one ? 1 : children.length; i < length; i++) {
      const child = one ? children : children[i]!
      if (child._tag === "Text") continue
      const below = child._tag === "Element" ? plainTree(child) : -1
      if (below < 0) return -1
      props += below
    }
    return props
  }
  /**
   * Re-applies the controlled properties under a rendered element, as a patch to the same view does:
   * children first, so a select's value wins over its options' `selected`.
   */
  const restoreControlled = (rendered: RElement): void => {
    const children = listOf(rendered.children)
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!
      if (child._tag === "Element") restoreControlled(child)
    }
    const props = rendered.v.props
    if (props !== View.noFields) patchProps(rendered.node, props, props)
  }

  const patchElement = (
    inst: Instance,
    rendered: Extract<Rendered, { readonly _tag: "Element" }>,
    element: View.Element<any, any>,
    env: Env
  ): void => {
    const prev = rendered.v
    // The view it was patched to last time, such as what `h.lazy` gave again: with only elements and
    // text below, only a controlled property can have changed. A child below may still have to change,
    // such as a fallback.
    if (element === prev) {
      const props = plainTree(rendered)
      if (props > 0) restoreControlled(rendered)
      if (props >= 0) return
    }
    const node = rendered.node
    // One record, as when no attribute is set or a builder is reused: nothing changed.
    if (prev.attrs !== element.attrs) patchAttrs(node, prev.attrs, element.attrs)
    if (
      element.handlers !== prev.handlers || element.eventOptions !== prev.eventOptions ||
      element.owned !== prev.owned
    ) {
      setEvents(inst, node, element)
    }
    const children = rendered.children
    const views = element.children
    if (children === undefined) {
      if (views.length > 0) rendered.children = packed(createList(inst, node, views, undefined, env))
    } else if (Array.isArray(children)) {
      rendered.children = packed(patchList(inst, node, children, views, undefined, env))
    } else {
      // One child, patched as `patchList` patches the two kinds most nodes are, without a list for it.
      const view = views.length === 1 ? views[0]! : undefined
      if (
        view !== undefined && view._tag === "Element" && children._tag === "Element" &&
        children.v.tag === view.tag && children.v.elementKey === view.elementKey
      ) {
        patchElement(inst, children, view, env)
      } else if (view !== undefined && view._tag === "Text" && children._tag === "Text") {
        if (view.text !== children.v.text) host.setText(children.node, view.text)
        children.v = view
      } else {
        rendered.children = packed(patchList(inst, node, [children], views, undefined, env))
      }
    }
    patchProps(node, prev.props, element.props)
    // A mount belongs to the element, not to one view run: it keeps running across patches, and
    // gets each new args. A mount of another definition replaces it. An owned layer's mount belongs
    // to its part: it runs while the part is applied.
    if (element.mount !== prev.mount) rendered.mount = patchMount(inst, rendered, element.mount, env)
    rendered.v = element
    if (element.owned !== prev.owned) {
      rendered.ownedMounts = startOwnedMounts(inst, element, rendered.node, env, rendered.ownedMounts ?? [])
    }
  }

  const patch = (inst: Instance, rendered: Rendered, view: View.Node<any, any>, env: Env): Rendered => {
    switch (rendered._tag) {
      case "Element": {
        patchElement(inst, rendered, view as View.Element<any, any>, env)
        return rendered
      }
      case "Text": {
        const text = view as View.Text
        if (text.text !== rendered.v.text) host.setText(rendered.node, text.text)
        rendered.v = text
        return rendered
      }
      case "Fallback":
      case "Child": {
        const child = view as View.Child<any, any>
        const next = patchChild(inst, rendered, child, env)
        return child.detached ? detach(inst, next) : next
      }
      case "Detached":
        return patchDetached(inst, rendered, view as View.Child<any, any>, env)
      case "Outlet": {
        const out = rendered.inst
        const outlet = outletOf.get(out)!
        // Moved between an element that holds text and one that can't: its content is checked again.
        const moved = outlet.view.noText !== (view as View.Outlet).noText
        outlet.view = rendered.v = view as View.Outlet
        if (moved || isStale(out, outlet)) renderOutlet(out)
        return rendered
      }
    }
  }

  /** A detached child after a patch: patched in its container, then attached if its view says so. */
  const patchDetached = (
    inst: Instance,
    rendered: RDetached,
    child: View.Child<any, any>,
    env: Env
  ): Rendered => {
    const next = patchChild(inst, rendered.inner, child, env)
    rendered.v = child
    if (next !== rendered.inner) {
      // It shows something else now, such as a feature once its Layer is ready: that goes in the container.
      place(rendered.container, [next], undefined)
      // A child that `patchChild` didn't keep is a new instance.
      if (next._tag === "Child") record(next.inst, { _tag: "Detached" })
      rendered.inner = next
    }
    return child.detached ? rendered : attach(inst, rendered, env)
  }

  const patchChild = (
    inst: Instance,
    rendered: RChild | RFallback,
    child: View.Child<any, any>,
    env: Env
  ): RChild | RFallback => {
    switch (rendered._tag) {
      case "Fallback": {
        const status = rendered.failedChild ? rendered.status : env.status
        if (status._tag === "Ready") {
          // Ready now: the fallback goes, and the feature mounts in its place.
          destroy(inst, rendered.inner)
          return makeChild(inst, child, env)
        }
        const shown = fallbackOf(inst, child, status, rendered.failedChild)
        return {
          _tag: "Fallback",
          v: child,
          inner: patchOrReplace(inst, rendered.inner, shown, settled(env)),
          status,
          failedChild: rendered.failedChild
        }
      }
      case "Child": {
        const instance = rendered.inst
        if (instance.closed) {
          for (const node of nodesOf(rendered)) host.remove(node)
          // Failed: the child shows its fallback until the key changes.
          if (instance.failure !== undefined) return failedChild(inst, child, instance.failure, env)
          return makeChild(inst, child, env)
        }
        instance.onEmit = child.onEmit
        instance.onFailure = child.onFailure
        if (instance.waiting) {
          // Held until it adopts the server's nodes, which it does with the placement it had: props, slots and
          // a headless child's closure. The latest one is applied once it has.
          heldPlacement.set(instance, child)
          rendered.v = child
          return rendered
        }
        // Read first: most children are passed no slots, and this is cheaper than the map.
        const slotted = child.slots !== undefined || rendered.v.slots !== undefined
          ? slottedBy.get(instance)
          : undefined
        if (slotted !== undefined) slotted.values = child.slots
        const changed = !propsEqual(child.props, instance.props)
        if (changed) changeProps(instance, child.props)
        // A headless child's view is the closure, which is new on every render of whoever declared it.
        if (instance.owner !== undefined) instance.content = child.view
        if ((changed || instance.owner !== undefined) && !instance.closed) {
          // The instance a message is on its way to keeps its view until the flush: see `renderAbove`.
          if (instance === receiving) markDirty(instance)
          else {
            dirty.delete(instance)
            render(instance)
          }
        }
        if (slotted !== undefined && !instance.closed) refreshOutlets(slotted)
        rendered.v = child
        return rendered
      }
    }
  }

  /** Patches a single root (a view's or a fallback's), which is kept only if its key matches too. */
  const patchOrReplace = (inst: Instance, rendered: Rendered, view: View.Node<any, any>, env: Env): Rendered => {
    // The pre-pass, as in `render`: a replaced subtree's watchers go before the new one is created.
    releaseRemoved([rendered], [view])
    if (match.patches(rendered.v, view)) {
      return patch(inst, rendered, view, env)
    }
    const next = create(inst, view, env)
    const nodes = nodesOf(rendered)
    const parentNode = nodes.length > 0 ? host.parentOf(nodes[0]) : undefined
    if (parentNode !== undefined) place(parentNode, [next], nodes[0])
    destroy(inst, rendered)
    return next
  }

  const nodesOf = (rendered: Rendered): Array<unknown> => {
    const out: Array<unknown> = []
    collectNodes(rendered, out)
    return out
  }

  /** Adds an item's host nodes to `out`, in order: one array however deep its children's go. */
  const collectNodes = (rendered: Rendered, out: Array<unknown>): void => {
    switch (rendered._tag) {
      case "Element":
      case "Text":
      case "Detached": {
        out.push(rendered.node)
        return
      }
      case "Fallback":
        return collectNodes(rendered.inner, out)
      case "Outlet":
      case "Child": {
        const items = rendered.inst.rendered
        for (let index = 0; index < items.length; index++) collectNodes(items[index]!, out)
      }
    }
  }

  /** The first host node of a rendered item, without collecting the others. `undefined` if it has none. */
  const firstNodeOf = (rendered: Rendered): unknown =>
    rendered._tag === "Child" || rendered._tag === "Outlet"
      ? firstNodeOfList(rendered.inst.rendered)
      : rendered._tag === "Fallback"
      ? firstNodeOf(rendered.inner)
      : rendered.node
  const lastNodeOf = (rendered: Rendered): unknown =>
    rendered._tag === "Child" || rendered._tag === "Outlet"
      ? lastNodeOfList(rendered.inst.rendered)
      : rendered._tag === "Fallback"
      ? lastNodeOf(rendered.inner)
      : rendered.node
  const hasNodes = (rendered: Rendered): boolean =>
    rendered._tag === "Child" || rendered._tag === "Outlet"
      ? rendered.inst.rendered.some(hasNodes)
      : rendered._tag === "Fallback"
      ? hasNodes(rendered.inner)
      : true
  const firstNodeOfList = (items: ReadonlyArray<Rendered>): unknown => {
    for (let index = 0; index < items.length; index++) {
      if (hasNodes(items[index]!)) return firstNodeOf(items[index]!)
    }
    return undefined
  }
  const lastNodeOfList = (items: ReadonlyArray<Rendered>): unknown => {
    for (let index = items.length - 1; index >= 0; index--) {
      if (hasNodes(items[index]!)) return lastNodeOf(items[index]!)
    }
    return undefined
  }

  /**
   * Puts each item's nodes before `ref`, last first, moving only what's out of place. The items
   * `stays` marks are in order in the host already, so the others move around them.
   */
  const place = (parentNode: unknown, items: ReadonlyArray<Rendered>, ref: unknown, stays?: Uint8Array) => {
    let next = ref
    for (let index = items.length - 1; index >= 0; index--) {
      const item = items[index]!
      const moves = stays === undefined || stays[index] !== 1
      if (item._tag === "Element" || item._tag === "Text" || item._tag === "Detached") {
        // One node: the common case, with no range to find.
        const node = item.node
        if (moves && (host.parentOf(node) !== parentNode || host.nextOf(node) !== next)) {
          host.insertBefore(parentNode, node, next)
        }
        next = node
        continue
      }
      if (!hasNodes(item)) continue
      const last = lastNodeOf(item)
      if (moves && (host.parentOf(last) !== parentNode || host.nextOf(last) !== next)) {
        insertNodes(parentNode, item, next)
      }
      next = firstNodeOf(item)
    }
  }

  /**
   * As `place`, for what hydration adopted. An item there can hold nodes built fresh among the server's,
   * so every node is checked, not each item's last. Returns the first node, or `ref` when there is none.
   */
  const placeEach = (parentNode: unknown, items: ReadonlyArray<Rendered>, ref: unknown): unknown => {
    let next = ref
    for (let index = items.length - 1; index >= 0; index--) {
      let item = items[index]!
      while (item._tag === "Fallback") item = item.inner
      if (item._tag === "Child" || item._tag === "Outlet") {
        next = placeEach(parentNode, item.inst.rendered, next)
        continue
      }
      const node = item.node
      if (host.parentOf(node) !== parentNode || host.nextOf(node) !== next) host.insertBefore(parentNode, node, next)
      next = node
    }
    return next
  }

  /** Puts an item's nodes before `ref`, in their order, without collecting them. */
  const insertNodes = (parentNode: unknown, rendered: Rendered, ref: unknown): void => {
    switch (rendered._tag) {
      case "Element":
      case "Text":
      case "Detached":
        return host.insertBefore(parentNode, rendered.node, ref)
      case "Fallback":
        return insertNodes(parentNode, rendered.inner, ref)
      case "Outlet":
      case "Child": {
        const items = rendered.inst.rendered
        for (let index = 0; index < items.length; index++) insertNodes(parentNode, items[index]!, ref)
      }
    }
  }

  // -- detached children ------------------------------------------------------
  /**
   * Moves a child's nodes out of the document, into a container of their own, and puts an empty text node
   * in their place. The child goes on rendering into them. Its element mounts stop until it's attached.
   */
  const detach = (inst: Instance, rendered: RChild | RFallback): RDetached => {
    if (host.createContainer === undefined) {
      throw new Error(
        `${inst.path}/${
          segment(rendered.v)
        } is declared detached, and this host has no createContainer to hold its nodes`
      )
    }
    const container = host.createContainer()
    park(inst, container)
    const placeholder = host.createText("")
    const nodes = nodesOf(rendered)
    const parentNode = nodes.length === 0 ? undefined : host.parentOf(nodes[0])
    if (parentNode !== undefined) {
      host.insertBefore(parentNode, placeholder, nodes[0])
      // Removed first, so the host lets go of what it showed in them, such as an open dialog.
      for (const node of nodes) host.remove(node)
    }
    for (const node of nodes) host.insertBefore(container, node, undefined)
    toggleMounts(inst, rendered, inst.env, false)
    if (rendered._tag === "Child") record(rendered.inst, { _tag: "Detached" })
    viewChanged = true
    return { _tag: "Detached", v: rendered.v, inner: rendered, node: placeholder, container }
  }

  /** Puts a detached child's nodes back where its placeholder is, and starts its element mounts again. */
  const attach = (inst: Instance, detached: RDetached, env: Env): RChild | RFallback => {
    const inner = detached.inner
    const parentNode = host.parentOf(detached.node)
    // Not in the host yet, as when its parent is new too: whoever places the parent's nodes places these.
    if (parentNode !== undefined) insertNodes(parentNode, inner, detached.node)
    host.remove(detached.node)
    unpark(inst, detached.container)
    toggleMounts(inst, inner, env, true)
    if (inner._tag === "Child") record(inner.inst, { _tag: "Attached" })
    viewChanged = true
    return inner
  }

  /**
   * Stops the mounts of the elements `rendered` shows, or starts them anew, at any depth below it but
   * for what a child detached on its own shows. A stopped mount's record stays on its element, so a patch
   * while detached updates it as usual, and `startMount` doesn't start one in a container.
   */
  const toggleMounts = (inst: Instance, rendered: Rendered, env: Env, start: boolean): void => {
    // No mount ever started.
    if (!host.runsMounts) return
    switch (rendered._tag) {
      case "Element": {
        stopMounts(inst, rendered)
        if (start) {
          // As `create` starts them.
          const view = rendered.v
          rendered.mount = view.mount !== undefined
            ? startMount(inst.author, view.mount, rendered.node, env, inst)
            : undefined
          rendered.ownedMounts = startOwnedMounts(inst, view, rendered.node, env)
        }
        for (const child of listOf(rendered.children)) toggleMounts(inst, child, env, start)
        return
      }
      case "Fallback":
        return toggleMounts(inst, rendered.inner, settled(env), start)
      case "Child":
      case "Outlet": {
        const child = rendered.inst
        for (const item of child.rendered) toggleMounts(child, item, child.env, start)
        return
      }
      case "Detached":
      case "Text":
        return
    }
  }

  const closeAll = (inst: Instance, rendered: Rendered): void => {
    switch (rendered._tag) {
      case "Outlet":
      case "Child": {
        inst.children.delete(rendered.inst)
        viewChanged = true
        releaseWatches(rendered.inst)
        leave(rendered.inst)
        closeInstance(inst, rendered.inst)
        return
      }
      case "Fallback":
        return closeAll(inst, rendered.inner)
      case "Detached": {
        unpark(inst, rendered.container)
        return closeAll(inst, rendered.inner)
      }
      case "Element": {
        // The element's `onMount` work ends with it.
        stopMounts(inst, rendered)
        const children = rendered.children
        if (children === undefined) return
        if (!Array.isArray(children)) return closeAll(inst, children)
        for (const child of children) closeAll(inst, child)
        return
      }
      case "Text":
        return
    }
  }

  /** Scope first: it interrupts in-flight work and unmounts descendants. Then the nodes go, once. */
  const destroy = (inst: Instance, rendered: Rendered) => {
    if (rendered._tag === "Element" || rendered._tag === "Text") {
      // One node, with nothing to collect.
      closeAll(inst, rendered)
      host.remove(rendered.node)
      return
    }
    // Collected first: closing a child empties what it rendered.
    const nodes = nodesOf(rendered)
    closeAll(inst, rendered)
    for (let index = 0; index < nodes.length; index++) host.remove(nodes[index])
  }

  /** Destroys every node of a list, in one step when the host can clear their parent. */
  const destroyAll = (inst: Instance, parentNode: unknown, olds: ReadonlyArray<Rendered>) => {
    if (host.removeChildren === undefined) {
      for (let index = 0; index < olds.length; index++) destroy(inst, olds[index]!)
      return
    }
    // Collected first, as `destroy` does: closing a child empties what it rendered.
    const nodes: Array<unknown> = []
    for (let index = 0; index < olds.length; index++) {
      const old = olds[index]!
      if (old._tag === "Element" || old._tag === "Text") nodes.push(old.node)
      else nodes.push(...nodesOf(old))
    }
    for (let index = 0; index < olds.length; index++) closeAll(inst, olds[index]!)
    host.removeChildren(parentNode, nodes)
  }

  // -- root -----------------------------------------------------------------
  // The first mount follows from the session's start.
  origin = recordTree({ _tag: "SessionStarted", app: component.definition.name })
  if (origin === -1) origin = undefined
  depth++
  // Registered before the root instance forks its Scope from `rootScope`: finalizers run in
  // reverse, so every instance Scope (and its Layers' finalizers) closes before the nodes go.
  let rootRendered: () => ReadonlyArray<Rendered> = () => []
  addFinalizer(
    rootScope,
    Effect.sync(() => {
      for (const node of rootRendered().flatMap(nodesOf)) host.remove(node)
      for (const node of rootFallbackNodes) host.remove(node)
      rootFallbackNodes = []
      host.commit?.()
      // The tree's entries go with it, so the host puts the shell's values back.
      if (merged !== emptyHead) {
        merged = emptyHead
        mergedTitle = undefined
        if (ownsHead && adoptedDone) host.head?.(merged)
      }
    })
  )
  // Hydration: the root's range among the container's nodes, which may hold more than the app.
  const rootPath = `/${component.definition.name}`
  let rootRange: Range | undefined
  let rootRef: unknown = undefined
  if (hydrating !== undefined && hydration !== undefined) {
    for (let node = hydration.firstChild(container); node !== undefined; node = host.nextOf(node)) {
      const kind = hydration.inspect(node)
      if (kind._tag === "Open" && kind.path === rootPath) {
        rootRange = rangeFrom(node, rootPath, undefined)
        break
      }
    }
    if (rootRange !== undefined) rootRef = host.nextOf(rootRange.close)
  }
  const root = makeInstance(
    component,
    rootProps,
    rootPath,
    "",
    undefined,
    readyEnv(withCache(ctx)),
    () => undefined,
    undefined,
    rootRange
  )
  if (rootRange !== undefined && !rootRange.claimed) removeRange(rootRange)
  rootRendered = () => root.rendered
  rootInstance = root
  // Added after the root forked its Scope, so it runs before that Scope closes.
  addFinalizer(rootScope, Effect.sync(() => leave(root)))
  if (root.failure === undefined) placeEach(container, root.rendered, rootRef)
  started = true
  if (waiting === 0 && !adoptedDone) {
    adoptedDone = true
    hydrating = undefined
    reportPending = true
  }
  // Mounting drains like a flush, its head fold included. `onMount` work runs after the commit, so its
  // updates come later: on a hydrating mount, the head this fold computes is the fold of the server's state.
  drain()
  depth--
  origin = undefined
  if (reportPending) reportAdoption()
  host.commit?.()

  const snapshot = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    const visit = (inst: Instance) => {
      // A keyed query's pending writes go first, so the result holds only the declared keys. A
      // navigation issued in the `update` that changed them runs in the flush's deferred work, which
      // can come before the drain gets to them.
      if (inst.keyed !== undefined && inst.keyed.size > 0) drainKeyed(inst)
      if (inst.closed || inst.failure !== undefined || inst.waiting) return
      // An outlet has no state of its own, only the children of the content it places. An owner of shared
      // state is left out: a reload would reopen what nobody hovers. Its subtree isn't.
      if (inst.component !== outletComponent && inst.component.definition.shares === undefined) {
        const encoded = stateCodecOf(inst.component).encode(inst.model, inst.results)
        if (Option.isSome(encoded)) out[inst.path] = encoded.value
      }
      for (const child of inst.children) visit(child)
    }
    visit(root)
    return out
  }
  if (hooks !== undefined) {
    handle = {
      container,
      get hydrated() {
        return root.adoptsChildren
      },
      static: fromStatic,
      flush: () => flushes,
      flushing: () => rendering,
      snapshot,
      // The first navigation closes the fetch-free window, if adoption hasn't yet.
      navigated: closeWindow,
      report
    }
    const detach = hooks.attach(handle)
    addFinalizer(rootScope, Effect.sync(detach))
  }
  attached = true
  afterCommitHooks()
  rendering = false
  runCommitted()

  const find = (path: string, from: Instance = root): Instance | undefined => {
    if (from.path === path) return from
    for (const child of from.children) {
      const hit = find(path, child)
      if (hit !== undefined) return hit
    }
    return undefined
  }

  const runsOf = (inst: Instance): Array<Pending> =>
    inst.runs.map((run) => ({ path: inst.path, name: run.command.name, status: run.status }))
  const pendingOf = (inst: Instance): Array<Pending> => [
    ...runsOf(inst),
    ...[...inst.children].flatMap(pendingOf)
  ]

  return {
    path: root.path,
    session,
    instance: root,
    emitted: rootEmitted,
    find,
    model: () => root.failure === undefined ? root.model : undefined,
    send: (message) => root.dispatch(message, { _tag: "Dispatch" }),
    pending: () => pendingOf(root),
    get cache() {
      return queryCache()
    },
    crashed: () => root.failure,
    flush: () => flushes,
    buildsPendingSince,
    head: () => merged,
    adoptionHead: () => {
      // No fold was kept since the last instance adopted: the root failed in it, say.
      settleAdoptionHead()
      return adoptionHead
    },
    adopted: Effect.callback<void>((resume) => {
      if (adoptedDone && !reportPending) resume(Effect.void)
      else adoptedWaiters.push(() => resume(Effect.void))
    }),
    waiting: () => {
      const out: Array<string> = []
      const visit = (inst: Instance) => {
        if (inst.waiting) out.push(inst.path)
        for (const child of inst.children) visit(child)
      }
      visit(root)
      return out
    },
    whenIdle: (f) => {
      idleWaiters.push(f)
      checkIdle()
    },
    freeze: () => {
      if (scheduled || dirty.size > 0 || deferred.length > 0 || reportsDue.size > 0) flush()
      frozen = true
      return cache
    }
  }
}
