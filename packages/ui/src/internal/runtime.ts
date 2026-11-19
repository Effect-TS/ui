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
import * as PubSub from "effect/PubSub"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Scheduler from "effect/Scheduler"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as Command from "../Command.ts"
import type * as Component from "../Component.ts"
import * as Feature from "../Feature.ts"
import * as Head from "../Head.ts"
import * as MessageLog from "../MessageLog.ts"
import * as Mount from "../Mount.ts"
import * as Query from "../Query.ts"
import type * as Renderer from "../Renderer.ts"
import * as Router from "../Router.ts"
import * as Subscription from "../Subscription.ts"
import * as View from "../View.ts"
import { propsEqual, sharedEqual } from "./equal.ts"
import * as Executor from "./executor.ts"
import * as match from "./match.ts"
import { isKeyed, keyOf } from "./match.ts"
import { isNoop } from "./noop.ts"
import {
  checkAuthorPlacements,
  checkAuthorRefs,
  checkChildPaths,
  checkContentPaths,
  checkFallbackPaths,
  type ChildPaths,
  segment,
  slotSegment
} from "./paths.ts"
import * as componentQueries from "./queries.ts"
import * as schedule from "./schedule.ts"
import { holdsRedacted } from "./schemaRedact.ts"
import { scopeAddFinalizerUnsafe } from "./scope.ts"
import * as serverHost from "./serverHost.ts"
import * as services from "./services.ts"
import * as sharedReads from "./shared.ts"
import * as subscriptionKeys from "./subscriptions.ts"

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

const readyEnv = (ctx: Context.Context<any>, parent?: Env): Env => ({
  ctx,
  failure: undefined,
  memoMap: undefined,
  parent,
  waiters: [],
  never: false
})
const buildingEnv = (parent: Env, never = parent.never): Env => ({
  ctx: undefined,
  failure: undefined,
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
  for (const waiter of env.waiters.splice(0)) waiter.ready(ctx)
}
const failEnv = (env: Env, cause: Cause.Cause<unknown>) => {
  env.failure = cause
  for (const waiter of env.waiters.splice(0)) waiter.failed?.(cause)
}
const memoMapOf = (env: Env): Layer.MemoMap => env.memoMap ??= Layer.CurrentMemoMap.forkOrCreate(env.ctx!)
const unavailable = (env: Env): AsyncResult.Initial<never, unknown> | AsyncResult.Failure<never, unknown> =>
  env.failure !== undefined ? AsyncResult.failure(env.failure) : AsyncResult.initial(true)

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

type Rendered = RElement | RText | RChild | RFallback | ROutlet

/**
 * A rendered element. A patch updates it in place, so a node that stays keeps
 * its record and the list it is in can tell nothing moved.
 */
interface RElement {
  readonly _tag: "Element"
  v: View.Element<any, any>
  readonly node: unknown
  children: Array<Rendered>
  mount: RunningMount | undefined
  /** The mounts of the element's owned layers, by owner and mount name. */
  ownedMounts: ReadonlyArray<OwnedMount> | undefined
}

/**
 * A started mount: its Scope, the mount the element last rendered with, and the cell its `changes`
 * Stream reads. The PubSub is built when `changes` is first read and keeps one value for each reader.
 */
interface RunningMount {
  readonly scope: Scope.Closeable
  mount: View.Mount<any>
  pubsub: PubSub.PubSub<unknown> | undefined
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

/**
 * For each event a part handles, the paths of the instances that get it, deepest owner first and the
 * view's author last. An event only the author handles isn't listed. What `TestElement.owners` shows.
 *
 * @internal
 */
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
  readonly failure: Cause.Cause<unknown> | undefined
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
      found = findChild(r.children, key)
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
  /** The run at the cache, begun at issue. `undefined` for a `Command.make` Command. */
  readonly handle: Query.RunHandle | undefined
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
}

interface SubscriptionRun {
  /** The name and deps the key was built from, for the entry that logs its stop. */
  readonly name: string
  readonly deps: ReadonlyArray<Subscription.Dep> | undefined
  readonly scope: Scope.Closeable
  fiber: Fiber.Fiber<unknown, unknown> | undefined
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
  /** Counts the root's instances in creation order: the check after a push skips older ones. */
  readonly born: number
  readonly depth: number
  readonly component: Component.Any
  readonly parent: Instance | undefined
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
  /** The entries from the component's `head`, as of the last render. */
  head: ReadonlyArray<Head.Entry>
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
  /** Hydration: the instance's head entries and child instances as they were when it mounted. */
  readonly snapshot: Snapshot | undefined
  /** On the server: the client builds this instance fresh, because its Layer wasn't built. */
  deferred: boolean
  readonly runs: Array<Run>
  // The collections below are made on their first entry: most instances never hold one, and an
  // empty Map or Set costs about 150 bytes.
  /** `Unmounted` is logged: the instance left the tree, though its Scope may still be closing. */
  left: boolean
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
  prefetch: { declaration: services.Prefetch; readonly release: () => void } | undefined
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
  /** The query cache the runtime owns. */
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
  /** The merged head, as last given to the host. */
  readonly head: () => Head.Head
  /** Completes once no child is waiting to adopt the server's nodes. */
  readonly adopted: Effect.Effect<void>
  /** Hydration: the paths of the children still waiting for their Layer before they adopt. */
  readonly waiting: () => ReadonlyArray<string>
  /** On the server: calls `f` once nothing is in flight. */
  readonly whenIdle: (f: () => void) => void
  /** On the server: settles what's left synchronously, stops the tree and serialises it once. */
  readonly finish: () => {
    readonly nodes: ReadonlyArray<Renderer.ServerNode>
    readonly state: Renderer.State
  }
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
}

interface ServerOptions {
  readonly host: Renderer.Host<any>
  /** False with a budget of 0: the per-request cache starts no fetch. */
  readonly fetches: boolean
  /** Written into the state for the client: the HTML is built at deploy or held in a CDN. */
  readonly static: boolean
  /** Called at `finish`, before the cache is serialised and its fetches are interrupted. */
  readonly onFinish?: ((cache: ReturnType<typeof Query.internals>) => void) | undefined
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
    const bound = componentQueries.boundOf(component)
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

/** How long a declaration that ran for a route drops intents for it. Fixed. */
const intentGuardMillis = 30_000

const emptyText: View.Text = { _tag: "Text", text: "" }
const ignoreEvents = () => undefined

/**
 * What merging a tree with no entries gives: `Head.empty`'s fields in an object of its own, as a
 * merge's result is, so a root that closes still tells the host its head is gone.
 */
const noHead: Head.Head = { ...Head.empty }

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

/** Hydration: what an instance contributed to the head when it mounted, and its child instances then. */
interface Snapshot {
  entries: ReadonlyArray<Head.Entry>
  children: ReadonlyArray<Snapshot>
  /** Set once the merge of the flush the instance mounted in has run. */
  settled: boolean
  /** The instance failed before its snapshot settled, as in a title template that throws in that merge. */
  failed: boolean
}

/** The server's nodes for one instance: between its two markers. */
interface Range {
  readonly open: unknown
  readonly close: unknown
  readonly nodes: ReadonlyArray<unknown>
  /** Whether the instance took these nodes, so whoever declared the child leaves them in place. */
  claimed: boolean
}

/** How a view matches the server's nodes. */
type Plan =
  | {
    readonly _tag: "Element"
    readonly node: unknown
    /** `undefined` when the element's server content is text only: its children are built fresh. */
    readonly children: ReadonlyArray<Plan> | undefined
  }
  | { readonly _tag: "Text"; readonly node: unknown }
  // A child's range, or an outlet's.
  | { readonly _tag: "Child"; readonly range: Range }

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
    Effect.contextWith((ctx: Context.Context<Scope.Scope | Renderer.Renderer>) => {
      const startOptions = { ...options, server: undefined }
      return Effect.flatMap(
        makeQueryCache(ctx, startOptions),
        (cache) => start(component, props, container, ctx, cache, startOptions)
      )
    }))

/**
 * Renders a tree on the server: on a host that only keeps the node tree,
 * waiting for provided Layers and the per-request cache's fetches until
 * nothing is in flight or the budget runs out, then serialising it once.
 *
 * @internal
 */
export const prerender = (
  component: Component.Any,
  rootProps: unknown,
  options: {
    readonly budget: Duration.Input
    readonly elements: ReadonlyArray<string> | "any"
    readonly static?: boolean | undefined
    readonly onFinish?: ServerOptions["onFinish"]
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
        const ctx = Context.add(yield* Effect.context<never>(), Scope.Scope, scope)
        const startOptions: Options = {
          server: { host, fetches: started, static: options.static === true, onFinish: options.onFinish }
        }
        const cache = yield* makeQueryCache(ctx, startOptions)
        const root = yield* start(component, props, host.createElement("#root"), ctx, cache, startOptions)
        if (started) {
          yield* Effect.raceFirst(
            Effect.callback<void>((resume) => {
              root.whenIdle(() => resume(Effect.void))
            }),
            Effect.sleep(budget)
          )
        }
        const out = root.finish()
        return { nodes: out.nodes, state: out.state, model: root.model(), head: root.head() }
      }),
      (scope, exit) => Scope.close(scope, exit)
    ))

/**
 * The cache the root owns, disposed with the root's Scope. The runtime re-adds it wherever work runs,
 * so `Component.provide` can't shadow it.
 */
const makeQueryCache = (ctx: Context.Context<any>, options: Options | undefined) => {
  const server = options?.server
  const scheduler = Context.get(ctx, Executor.CurrentExecutor).scheduler
  return Query.makeCache({
    visibility: Context.get(ctx, Query.Visibility),
    connectivity: Context.get(ctx, Query.Connectivity),
    report: Context.get(ctx, Query.Problems),
    idleMs: Query.cacheIdleMs(options?.query?.idleTimeToLive),
    // The server's per-request cache: one fetch per key per request, and none with a budget of 0.
    settleOnce: server !== undefined,
    fetches: server === undefined || server.fetches
  }).pipe(
    // Its fetches and timers run on the runtime's scheduler, so `TestHost.settle` drains them.
    Effect.provideContext(scheduler === undefined ? ctx : Context.add(ctx, Scheduler.Scheduler, scheduler))
  )
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
  cache: ReturnType<typeof Query.internals>,
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
      root = setup(component, rootProps, container, Context.add(ctx, Scope.Scope, scope), cache, options)
    } finally {
      setUp.openUnsafe()
    }
    // A callback may have closed the owner during setup.
    return isClosed(owner) ? Effect.interrupt : Effect.succeed(root)
  })

const isClosed = (scope: Scope.Scope): boolean => scope.state._tag === "Closed"

const setup = (
  component: Component.Any,
  rootProps: unknown,
  container: unknown,
  ctx: Context.Context<any>,
  cache: ReturnType<typeof Query.internals>,
  options: Options | undefined
): Root & Renderer.Root<any, any> => {
  const server = options?.server
  const host: Renderer.Host<any> = server !== undefined ? server.host : Context.get(ctx, services.Renderer).host
  const log = Context.get(ctx, MessageLog.MessageLog)
  const executor = Context.get(ctx, Executor.CurrentExecutor)
  const clock = Context.get(ctx, Clock.Clock)
  const rootScope = Context.get(ctx, Scope.Scope)
  const session = `${clock.currentTimeMillisUnsafe().toString(36)}-${(sessions++).toString(36)}`
  const controlled = host.controlled
  const rootEmitted: Array<unknown> = []
  const sharedBuilds = new WeakMap<Env, Map<Layer.Layer<any, any, any>, SharedBuild>>()
  const hooks = Option.getOrUndefined(Context.getOption(ctx, services.RootHooks))

  // The problems sink, read once. A throw from it is swallowed: a check only reports.
  const problems = Context.get(ctx, Query.Problems)
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
  const settleWaiting = () => {
    // A reader below a held owner may have mounted, or gone.
    if (heldReports.size > 0) {
      for (const owner of heldReports) reportsDue.add(owner)
      heldReports.clear()
      wake()
    }
    waiting--
    if (waiting === 0 && started) finishAdoption()
  }
  const finishAdoption = () => {
    if (adoptedDone) return
    adoptedDone = true
    hydrating = undefined
    // Reported after this flush's live merge, so it reuses the templates that merge applied. `adopted`
    // completes with the report.
    reportPending = true
    // Head sync starts with the flush after adoption.
    headDirty = true
    wake()
  }

  // -- log ------------------------------------------------------------------
  let seq = 0
  /** Logs an entry about the tree, and returns its number. */
  const recordTree = (draft: TreeDraft): number => {
    if (!log.enabled) return -1
    const entry = { ...draft, seq: ++seq, at: clock.currentTimeMillisUnsafe(), session } as MessageLog.Entry
    log.record(entry)
    return entry.seq
  }
  /** Logs an entry about `inst`, and returns its number. */
  const record = (inst: Instance, draft: Draft): number => {
    if (!log.enabled) return -1
    const entry = {
      ...draft,
      seq: ++seq,
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
  const forkNow = <A, E>(context: Context.Context<any>, effect: Effect.Effect<A, E, any>): Fiber.Fiber<A, E> =>
    Effect.runForkWith(withScheduler(context))(effect)
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
  const closeScope = (scope: Scope.Closeable): Fiber.Fiber<void> | undefined => {
    const rest = Scope.closeUnsafe(scope, Exit.void)
    if (rest === undefined || (Exit.isExit(rest) && Exit.isSuccess(rest))) return undefined
    const fiber = forkNow(ctx, Effect.uninterruptible(rest))
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
    const fiber = closeScope(scope)
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
  const withCache = (context: Context.Context<any>): Context.Context<any> =>
    Context.add(context, Query.Cache, cache as unknown as Query.Cache["Service"])
  /**
   * History restore: each query result restored seeds a cold entry, stale, so the first frame shows the data
   * with `waiting: true` while one refetch runs. A snapshot taken under a patch may hold a value that
   * was never saved: it seeds nothing, and the query starts from loading.
   */
  const restoreQueries = (
    component: Component.Any,
    results: componentQueries.Results | undefined
  ): componentQueries.Results | undefined => {
    const bound = componentQueries.boundOf(component)
    if (bound === undefined || results === undefined) return results
    const out: Record<string, unknown> = {}
    for (const entry of bound.entries) {
      const snapshot = results[entry.name]
      if (entry.keyed) {
        // Per tuple: one taken under a patch is dropped.
        const map = Query.snapshotMapData(snapshot)
        const kept: Array<unknown> = []
        for (const one of map?.entries.values() ?? []) {
          if (Query.snapshotData(one)!.patched) continue
          cache.seed(one)
          kept.push(one)
        }
        out[entry.name] = map !== undefined && kept.length === map.entries.size
          ? snapshot
          : bound.snapshotMany(entry, kept)
        continue
      }
      const data = Query.snapshotData(snapshot)
      if (data !== undefined && !data.patched) {
        cache.seed(snapshot)
        out[entry.name] = snapshot
      } else out[entry.name] = bound.empty[entry.name]
    }
    return out
  }
  // Every fetch the cache starts is logged, as an entry about the tree.
  const offFetch = cache.onFetch((event) => {
    if (!frozen) recordTree({ _tag: "FetchStarted", ...event })
  })
  // On the server a fetch in flight holds the response, so one that ends may make the tree idle.
  const offFetchEnd = server === undefined ? undefined : cache.onFetchEnd(() => checkIdle())
  // Hydration: the server's entries, held raw until their queries register. This opens the fetch-free
  // window, which closes at adoption or the first navigation.
  if (hydrating !== undefined && hydrating.state["~query"] !== undefined) {
    cache.hydrate(hydrating.state["~query"], { static: hydrating.state["~static"] === true })
  }
  // The root's close waits until every run fiber has exited, stopped ones included, and every Scope
  // close already started, such as an unmounted instance's, has finished.
  let rootClosed = false
  addFinalizer(
    rootScope,
    Effect.suspend(() => {
      rootClosed = true
      offFetch()
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
   * The cache hold of the current render pass. A watcher registered outside a drain opens one and
   * schedules a flush, and the drain releases it once nothing is left to render: every release and
   * registration of the pass is in before any zero-to-one decision is made.
   */
  let watchHold: (() => void) | undefined
  let draining = false
  const holdWatches = () => {
    if (watchHold !== undefined) return
    watchHold = cache.hold()
    if (!draining) wake()
  }
  const isHolding = () => watchHold !== undefined
  const releaseWatchHold = () => {
    const release = watchHold
    watchHold = undefined
    release?.()
  }
  // How many times each instance has delivered sends in this flush: a parent and a child that answer
  // each other would otherwise never leave `drainLoop`.
  const sendPasses = new Map<Instance, number>()
  // How many times each owner of shared state has sent its readers' `onChange` or its own `collects.onChange` in
  // this flush: a reader whose answer changes the shared value again would otherwise never leave `drainLoop`.
  const sharedPasses = new Map<Instance, number>()
  // Owners whose readers' reports may have changed: read once nothing is left to render.
  const reportsDue = new Set<Instance>()
  // Hydration: owners whose first comparison waits for an instance below them to adopt.
  const heldReports = new Set<Instance>()
  const markDirty = (inst: Instance) => {
    dirty.add(inst)
    wake()
  }
  const defer = (f: () => void) => {
    deferred.push(f)
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
    settleSnapshots()
    if (reportPending) reportAdoption()
    host.commit?.()
    afterCommitHooks()
    rendering = false
    runCommitted()
    checkIdle()
  }
  /**
   * Renders what's dirty, runs deferred work and merges the head, until none
   * is left. A title template that throws fails its instance, so the fallback
   * renders and the head is merged again.
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
          else deliverReports(reportsDue.values().next().value!)
          continue
        }
        let next: Instance | undefined
        for (const inst of dirty) {
          if (next === undefined || inst.depth < next.depth) next = inst
        }
        dirty.delete(next!)
        if (!next!.closed) render(next!)
        checkPendingRefs()
      }
      mergeHead()
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
      if (cache.pending().length > 0) return
      for (const f of idleWaiters.splice(0)) f()
    })
  }
  const runCommitted = () => {
    const done = committed
    committed = []
    for (const f of done) f()
  }

  // -- head and the router's hook --------------------------------------------
  // Set when an instance with `head` rendered, or the tree lost an instance.
  let headDirty = false
  let merged: Head.Head = Head.empty
  // Set when `merged` holds a head the host hasn't been given.
  let headChanged = false
  let rootInstance: Instance | undefined
  let handle: services.RootHandle | undefined

  /** Whether an instance with a `head` option has rendered. Until one has, the merged head is empty. */
  let headed = false

  const updateHead = (inst: Instance) => {
    const head = inst.component.head
    if (head === undefined) return
    headed = true
    const entries = guard(inst, "head", () => head(inst.model, inst.props, inst.results))
    if (entries === undefined) return
    inst.head = entries
    headDirty = true
  }

  /**
   * Title template results, kept per entry and title so the adoption report
   * reuses what the live merges computed instead of calling templates again.
   * It exists only while a hydrating root has a report to make, and is dropped
   * once the report is made.
   */
  let templates: WeakMap<Head.TitleTemplate, Head.TitleTemplate> | undefined =
    hydrating !== undefined && hydration?.adopted !== undefined ? new WeakMap() : undefined
  const memoized = (entries: ReadonlyArray<Head.Entry>): ReadonlyArray<Head.Entry> =>
    templates === undefined ? entries : entries.map((entry) => {
      if (entry._tag !== "TitleTemplate" || templates === undefined) return entry
      let found = templates.get(entry)
      if (found === undefined) {
        const results = new Map<string, string>()
        found = {
          _tag: "TitleTemplate",
          apply: (title) => {
            if (results.has(title)) return results.get(title)!
            const result = entry.apply(title)
            results.set(title, result)
            return result
          }
        }
        templates.set(entry, found)
      }
      return found
    })

  /** The head entries in document order. A child's fallback contributes none. */
  const headTree = (inst: Instance): Head.Tree => ({
    entries: inst.closed || inst.failure !== undefined ? [] : memoized(inst.head),
    children: inst.closed || inst.failure !== undefined ? [] : inst.rendered.flatMap(headChildren),
    // A throwing title template fails the instance that declared it.
    onError: (error) => failInstance(inst, Cause.die(error), "head")
  })
  const headChildren = (rendered: Rendered): Array<Head.Tree> =>
    rendered._tag === "Child" || rendered._tag === "Outlet"
      ? [headTree(rendered.inst)]
      : rendered._tag === "Element"
      ? rendered.children.flatMap(headChildren)
      : []

  /** The child instances an instance rendered, as their snapshots. A failed child has none. */
  const snapshotChildren = (rendered: Rendered): Array<Snapshot> =>
    rendered._tag === "Child"
      ? rendered.inst.snapshot === undefined || rendered.inst.failure !== undefined ? [] : [rendered.inst.snapshot]
      : rendered._tag === "Element"
      ? rendered.children.flatMap(snapshotChildren)
      : rendered._tag === "Outlet"
      ? rendered.inst.rendered.flatMap(snapshotChildren)
      : []
  const snapshotTree = (snapshot: Snapshot): Head.Tree => ({
    entries: memoized(snapshot.entries),
    children: snapshot.children.filter((child) => !child.failed).map(snapshotTree),
    onError: () => {}
  })
  /** Snapshots taken in this flush. Its merge has run once the flush gets to `settleSnapshots`. */
  const unsettled: Array<Snapshot> = []
  const settleSnapshots = () => {
    for (const snapshot of unsettled.splice(0)) snapshot.settled = true
  }

  /**
   * Reports the head the tree had at adoption: each instance's entries and
   * children as they were when it mounted, a waiting child's from when it
   * adopted. It runs after the live merge of the flush that finished
   * adoption, whose template results it reuses. A template is only called for
   * the report when no live merge applied it to that title, which happens
   * when an ancestor rendered again while the child holding the title waited.
   */
  let reportPending = false
  const reportAdoption = () => {
    reportPending = false
    const root = rootInstance
    if (hydration?.adopted !== undefined && root?.snapshot !== undefined) {
      hydration.adopted(root.snapshot.failed ? Head.empty : Head.merge(snapshotTree(root.snapshot)))
    }
    templates = undefined
    // The fetch-free window closes at adoption, unless a navigation closed it first.
    cache.closeWindow()
    for (const f of adoptedWaiters.splice(0)) f()
  }

  const buildsPendingSince = (flush: number) => {
    let count = 0
    for (const stamp of building) if (stamp.flush >= flush) count++
    return count
  }

  /**
   * Merges the live tree's head once nothing is left to render. A title template
   * that throws fails its instance, which sets `headDirty` again: that merge saw
   * the removed subtree, so it's discarded. With the root failed nothing is left
   * to render and the next merge is final; otherwise the flush renders the
   * fallback first.
   */
  const mergeHead = () => {
    const root = rootInstance
    if (root === undefined) return
    while (headDirty && dirty.size === 0 && deferred.length === 0) {
      headDirty = false
      // No instance has entries to give, so the tree isn't read: an instance that goes away costs nothing here.
      const next = headed ? Head.merge(headTree(root)) : noHead
      if (!headDirty) {
        merged = next
        headChanged = true
      }
    }
  }

  /** After the nodes commit: head sync, then the router's hook. Both wait until every instance has adopted. */
  const afterCommitHooks = () => {
    if (!adoptedDone) return
    if (headChanged) {
      headChanged = false
      host.head?.(merged)
    }
    // A head still to merge belongs to the flush already scheduled, which calls the hook.
    if (hooks !== undefined && handle !== undefined && !headDirty) {
      hooks.afterFlush(handle, { flush: flushes, head: merged, buildsPendingSince })
    }
  }

  // -- failure --------------------------------------------------------------
  const guard = <A>(
    inst: Instance,
    where: MessageLog.FailedIn,
    f: () => A,
    name?: string
  ): A | undefined => {
    try {
      return f()
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
    inst.rendered = [{ _tag: "Text", v: emptyText, node: placeholder }]
  }

  /** Swaps the instance's nodes for an empty text node, closing its Scope. */
  const close = (inst: Instance) => {
    swapForPlaceholder(inst, () => {
      // Before the Scope closes: a Command's cleanup can hold the close open, and a fallback or
      // replacement created meanwhile must see the count without this instance's watchers.
      releaseWatches(inst)
      leave(inst)
      closeUnder(inst.parent, inst.scope)
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
    // Failing in the flush it mounted in, its head merge included, keeps it out of the adoption snapshot.
    if (inst.snapshot !== undefined && !inst.snapshot.settled) inst.snapshot.failed = true
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
    headDirty = true
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
      fiber.addObserver(done)
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
    const stamp = { flush: flushes }
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
   * for the Layer are interrupted. The server leaves it to the client. A selection a keyed provide
   * has replaced in the meantime is not heard from.
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
    inst.deferred = true
    failEnv(own, cause)
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
    if (inst.model !== selection.model || inst.props !== selection.props) {
      selection.model = inst.model
      selection.props = inst.props
      const keys = readKeys(inst.component, inst.props, inst.model)
      changed = !sameKeys(selection.keys, keys)
      if (changed) swap(inst, selection, keys)
    }
    selection.issued.clear()
    const held = selection.held
    selection.held = []
    for (const f of held) f()
    // Built once the held runs wait for it, so a build that fails at once interrupts them too.
    if (changed) startSelection(inst, selection, inst.env)
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
   * still building is interrupted now. The caller starts the new build.
   */
  const swap = (inst: Instance, selection: Selection, keys: Keys) => {
    selection.keys = keys
    const previous = inst.env
    const own = buildingEnv(selection.parentEnv)
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
  }

  /** Builds a selection made after mount, logged and counted as a build at mount is. */
  const startSelection = (inst: Instance, selection: Selection, own: Env) => {
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
      if (!inst.closed && pending) record(inst, { _tag: "LayerReady" })
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
    record(inst, { _tag: "LayerPending" })
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
    const fiber = forkNow(ctx, Effect.uninterruptible(releaseOf(retired)))
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
    const bound = componentQueries.boundOf(inst.component)
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
    headDirty = true
  }

  // -- instances ------------------------------------------------------------
  /**
   * Sets the instance's `dispatch` and `fire`, and adds its finalizers to its Scope: the closures
   * that live as long as it does. They are made here, so their context holds the instance and
   * `bound`, and not every local of `makeInstance`.
   */
  const instanceHandlers = (inst: Instance, bound: componentQueries.Bound | undefined) => {
    const handlers = inst as { -readonly [K in "dispatch" | "fire"]: Instance[K] }
    handlers.dispatch = (message, source) => {
      if (inst.closed || inst.waiting || frozen) return
      const component = inst.component
      let next: ReturnType<typeof component.update>
      try {
        next = component.update(inst.model, message as never, inst.props, inst.results)
      } catch (error) {
        // No `Update` is logged for it, so the failure carries the message.
        return failInstance(inst, Cause.die(error), "update", undefined, { message, source })
      }
      if (next === undefined) return
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
    }
    handlers.fire = (event, handler, payload, onMessage) => {
      if (inst.closed || inst.waiting) return
      const message = typeof handler === "function"
        ? guard(inst, "domEvent", () => (handler as (payload: unknown) => unknown)(payload), event)
        : handler
      if (message === undefined) return
      // Before the message is sent, so the host can still act on its event.
      onMessage?.()
      inst.dispatch(message, { _tag: "DomEvent", name: event })
    }

    // Descendants, Subscriptions and mounts use child Scopes forked later, so they close first. Then
    // Commands stop, and the close waits for them to exit. One finalizer, run as the Scope
    // closes: a Scope that holds nothing else needs no Map, and a close with no run to wait for
    // ends without a fiber.
    const finalizer = () => {
      // However the instance goes, a removed ancestor and failure included, its owners forget it.
      if (inst.owners !== undefined) { for (const owner of inst.owners.values()) owner.readers?.delete(inst) }
      const waits = stopRuns(inst)
      if (waits.length === 0) {
        unmounted(inst)
        return Effect.void
      }
      return Effect.andThen(awaitRuns(waits), Effect.sync(() => unmounted(inst)))
    }
    if (inst.scope.state._tag === "Closed") track(closing, forkNow(ctx, Effect.suspend(finalizer)))
    else scopeAddFinalizerUnsafe(inst.scope, inst, finalizer)
  }

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

  const makeInstance = (
    component: Component.Any,
    props: unknown,
    path: string,
    parent: Instance | undefined,
    parentEnv: Env,
    onEmit: (events: unknown) => unknown,
    onFailure: ((failure: AsyncResult.Failure<never, unknown>) => unknown) | undefined,
    range: Range | undefined,
    content?: ((parts: any) => View.Content<any, any>) | undefined,
    slots?: Slotted["values"]
  ): Instance => {
    const scope = Scope.forkUnsafe(parent?.scope ?? rootScope, "sequential")
    const bound = componentQueries.boundOf(component)
    const depth = parent === undefined ? 0 : parent.depth + 1
    const owner: View.Owner | undefined = content === undefined ? undefined : { path, depth }
    const inst: Instance = {
      path,
      born: ++instancesMade,
      depth,
      component,
      parent,
      author: undefined as any,
      owner,
      content,
      scope,
      env: parentEnv,
      selection: undefined,
      children: noChildren,
      props,
      model: undefined,
      results: undefined,
      head: [],
      onEmit,
      onFailure,
      failure: undefined,
      childPaths: undefined,
      clash: undefined,
      rendered: [],
      get closed() {
        return isClosed(this.scope) || this.parent?.closed === true
      },
      waiting: false,
      adoptsChildren: false,
      snapshot: hydrating === undefined || hydration?.adopted === undefined
        ? undefined
        : { entries: [], children: [], settled: false, failed: false },
      deferred: false,
      runs: [],
      left: false,
      closes: undefined,
      subscriptions: undefined,
      watches: undefined,
      watchesSynced: false,
      watched: undefined,
      prefetch: undefined,
      keyed: undefined,
      keyedQueued: false,
      loadMores: undefined,
      mounting: undefined,
      outbox: [],
      shares: undefined,
      readers: undefined,
      owning: component.definition.shares === undefined
        ? undefined
        : { seq: -1, round: false, collected: undefined, restored: false },
      owners: undefined,
      seen: undefined,
      dispatch: undefined as any,
      fire: undefined as any
    }
    // Made outside this function, the closures the instance keeps hold it alone, and not the
    // locals of its mount: see `instanceHandlers`.
    instanceHandlers(inst, bound)
    // `parentEnv` is the Env at the child node, but for a feature's implementation, which is passed no slots.
    if (component.definition.slots.length > 0) slottedBy.set(inst, { values: slots, env: parentEnv, placed: new Map() })
    inst.author = owner === undefined || parent === undefined ? inst : parent.author
    if (owner !== undefined) owners.set(owner, inst)
    if (recording > 0) {
      inst.watched = new Set()
      recorded.add(inst)
    }

    // Entries about the Layer wait until the instance's first entry, `Mounted` or `Waiting`, is logged.
    let buffering = true
    const early: Array<() => void> = []
    const lifecycle = (draft: Draft) => {
      if (buffering) early.push(() => record(inst, draft))
      else record(inst, draft)
    }
    const logEarly = () => {
      buffering = false
      for (const f of early.splice(0)) f()
    }
    let constructing = true
    let failedEarly: Cause.Cause<unknown> | undefined
    let pending = false

    // Hydration: the Model and query results the server rendered this path with, unless it deferred the path.
    const fromServer: Adopted = hydrating !== undefined &&
        (parent === undefined || parent.adoptsChildren) &&
        !hydrating.deferred.has(path) &&
        Object.hasOwn(hydrating.state, path)
      ? stateCodecOf(component).decode(hydrating.state[path])
      : Option.none()
    // An owner adopting the server's Model starts from what its reports last sent there.
    const collectedOnServer = Option.isSome(fromServer) && component.definition.collects !== undefined
      ? Option.flatMap(
        Option.fromUndefinedOr(hydrating!.state["~reported"]?.[path]),
        jsonCodecOf(component.definition.message).decode
      )
      : Option.none()

    /**
     * What the instance starts from: `init`'s result, and the Model it adopts from the server or from
     * history restore instead of `init`'s.
     */
    const startFrom = (serverModel: Adopted) => {
      const first = guard(inst, "init", () => {
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
      })
      let adopted = serverModel
      // An owner of shared state isn't restored from history: a reload would reopen what nobody hovers.
      if (
        first !== undefined && Option.isNone(adopted) && hooks !== undefined &&
        component.definition.shares === undefined
      ) {
        const restored = hooks.restore(path)
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
     * Read before the Layer builds, when a keyed provide selects the Layer from the starting Model.
     * `begin` takes it, so `init` runs once.
     */
    let selectedFrom: ReturnType<typeof startFrom> | undefined

    // A provided Layer builds in the background. The instance renders at once; its Commands,
    // Subscriptions and mounts, and its descendants', wait for it.
    if (component.layer !== undefined) {
      if (server !== undefined && (!component.layerOnServer || parentEnv.never)) {
        // Kept off the server: never built, and the budget doesn't wait for it. The client builds it fresh.
        inst.env = buildingEnv(parentEnv, true)
        inst.deferred = true
      } else {
        // A keyed provide selects from the Model the instance starts with: the server's when it
        // hydrates, else history's or `init`'s. Each selection builds in a Scope of its own.
        let keys: Keys = none
        let buildScope: Scope.Closeable | undefined
        if (component.layerKeys !== undefined) {
          let model: unknown
          if (Option.isSome(fromServer)) model = fromServer.value.model
          else {
            const { adopted, first } = selectedFrom = startFrom(fromServer)
            model = Option.isSome(adopted) ? adopted.value.model : first?.model
          }
          keys = readKeys(component, props, model)
          if (server !== undefined) {
            // The server builds once, from the Model it starts with.
            buildScope = Scope.forkUnsafe(scope, "sequential")
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
            addFinalizer(scope, closeSelection(selection))
          }
        }
        // Forked now, before the run-stop finalizer below, so a build that waits for its parent's Env
        // still closes after the instance's runs.
        buildScope ??= Scope.forkUnsafe(scope, "sequential")
        const sharedLayer = component.sharedLayer
        const shared = sharedLayer !== undefined ? acquireShared(parentEnv, sharedLayer) : undefined
        const own = shared !== undefined ? shared.env : buildingEnv(parentEnv)
        inst.env = own
        if (shared !== undefined) {
          addFinalizer(scope, Effect.suspend(() => releaseShared(parentEnv, sharedLayer!, shared)))
        }
        let settleBuild: (() => void) | undefined
        const buildStamp = shared !== undefined ? shared.stamp : ++builds
        const fail = (cause: Cause.Cause<unknown>) => {
          settleBuild?.()
          lastFailedBuild = Math.max(lastFailedBuild, buildStamp)
          // `init` failed, or a keyed provide has selected again since.
          if (inst.closed || inst.env !== own) return
          lifecycle({ _tag: "LayerFailed", cause })
          if (component.layerFailure === undefined && constructing) failedEarly = cause
          else ownFailed(inst, own, cause, logEarly)
        }
        const ready = () => {
          if (!inst.closed && pending) lifecycle({ _tag: "LayerReady" })
        }
        if (inst.closed) {
          // `init` failed before a keyed provide could select: nothing is built.
        } else if (shared !== undefined) {
          whenReady(own, ready, fail)
        } else {
          buildOwn(inst, parentEnv, own, buildScope, () => component.layer!(props, keysOrThrow(keys)), ready, fail)
        }
        if (!inst.closed && own.ctx === undefined && own.failure === undefined && failedEarly === undefined) {
          pending = true
          lifecycle({ _tag: "LayerPending" })
          settleBuild = countBuilding(own, buildScope)
        }
        // Added after the Layer's Scopes, which all exist by now, so the close stops the instance's runs
        // and waits for their cleanup before the services they use are released.
        addFinalizer(scope, Effect.suspend(() => awaitRuns(stopRuns(inst))))
      }
    }

    /**
     * Runs `init` and renders. An instance adopting a Model (from the server, or from
     * history restore) replays `init` only for its Commands, every one of them: the adopted
     * Model wins and events are dropped. Given the server's nodes, it adopts them when its
     * view matches, and otherwise builds fresh.
     */
    const begin = (range: Range | undefined, serverModel: Adopted) => {
      const { adopted, first } = selectedFrom ?? startFrom(serverModel)
      selectedFrom = undefined
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
          reportsDue.add(inst)
          wake()
        }
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
      logEarly()
      if (first === undefined) return
      // Before any child mounts: the readers below read it as they render.
      if (!refreshShares(inst, mountedSeq)) return
      // The first emission of each watch is written as its result before the first render, parent before
      // child, so a new instance over a warm entry never commits "Loading". An instance adopting the
      // server's state renders it first, to match the server's nodes, and gets the emissions after.
      const early: NonNullable<Instance["mounting"]> = []
      if (Option.isNone(serverModel) && bound !== undefined) {
        inst.mounting = early
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
      const plan = range !== undefined && Option.isSome(serverModel) ? matchList(inst, [tree], range.nodes) : undefined
      const rendered = guard(
        inst,
        "view",
        () => {
          const rendered = plan !== undefined ? adoptNode(inst, tree, plan[0]!, inst.env) : create(inst, tree, inst.env)
          throwClash(inst)
          return rendered
        }
      )
      if (rendered === undefined) return
      if (plan !== undefined) {
        // Adopted: the markers go, and the server's nodes are the instance's.
        range!.claimed = true
        host.remove(range!.open)
        host.remove(range!.close)
      }
      inst.rendered = [rendered]
      updateHead(inst)
      // Frozen at mount: later updates, removals and re-keys don't change what adoption looked like.
      if (inst.snapshot !== undefined) {
        inst.snapshot.entries = inst.head
        inst.snapshot.children = inst.rendered.flatMap(snapshotChildren)
        unsettled.push(inst.snapshot)
      }
      if (inst.failure !== undefined) return
      if (Option.isSome(adopted)) {
        apply(inst, { model: inst.model, commands: [], events: [] }, mountedSeq, true)
        first.commands.forEach((command, index) => issue(inst, command, { seq: mountedSeq, index }, index))
      } else apply(inst, { ...first, model: inst.model }, mountedSeq, true)
      // The Commands of the updates folded before the render: issued where `init`'s are, after them.
      for (const entry of early) issue(inst, entry.command, entry.issued, undefined)
    }

    if (failedEarly !== undefined) {
      constructing = false
      logEarly()
      failInstance(inst, failedEarly, "layer")
      return inst
    }

    // Hydration: an instance whose provided Layer is still building keeps the server's nodes, inert,
    // and adopts them once the Layer is ready. If the Layer fails and the component handles it,
    // the instance is built fresh and gets its failure message.
    if (
      range !== undefined && Option.isSome(fromServer) && component.layer !== undefined && !inst.closed &&
      inst.env.ctx === undefined && inst.env.failure === undefined
    ) {
      const raw: Rendered = { _tag: "Text", v: emptyText, node: undefined }
      // Its first entry: `Mounted` comes when the Layer is ready, and the Layer's entries come as they happen.
      record(inst, {
        _tag: "Waiting",
        props: inst.props,
        model: fromServer.value.model,
        ...(bound === undefined ? undefined : { queries: fromServer.value.results ?? bound.empty })
      })
      logEarly()
      inst.waiting = true
      waiting++
      range.claimed = true
      inst.rendered = [range.open, ...range.nodes, range.close].map((node) => ({ ...raw, node }))
      const resume = (adopt: boolean) => {
        if (inst.closed || !inst.waiting) return
        inst.waiting = false
        const nodes = inst.rendered.flatMap(nodesOf)
        inst.rendered = []
        range.claimed = false
        begin(range, adopt ? fromServer : Option.none())
        if (!range.claimed) {
          // Rebuilt: the new nodes take the server's place.
          const parentNode = host.parentOf(range.open)
          if (inst.failure === undefined && parentNode !== undefined) {
            for (const node of inst.rendered.flatMap(nodesOf)) host.insertBefore(parentNode, node, range.open)
          }
          for (const node of nodes) host.remove(node)
        }
        headDirty = true
        settleWaiting()
      }
      whenReady(inst.env, () => defer(() => resume(true)), () => {
        if (component.layerFailure !== undefined) defer(() => resume(false))
      })
      constructing = false
      return inst
    }

    begin(range, fromServer)
    constructing = false
    return inst
  }

  const apply = (inst: Instance, next: Component.Next<any, any, any, any>, entrySeq: number, initial: boolean) => {
    inst.model = next.model
    if (!refreshShares(inst, entrySeq)) return
    // Before its Commands are issued, so they wait for the read, even when the Model is unchanged.
    if (!initial && inst.selection !== undefined) inst.selection.due = true
    const mounting = inst.mounting
    if (mounting !== undefined) {
      // Before the first render: nothing is issued or marked dirty, and only the watches follow the Model.
      next.commands.forEach((command, index) => mounting.push({ command, issued: { seq: entrySeq, index } }))
      // The first render, which makes the children, comes first.
      if (queueSends(inst, next, entrySeq)) defer(() => deliverSends(inst))
      syncSubscriptions(inst, true)
      if (next.sends !== undefined && next.sends.length > 0) defer(() => sendToOwners(inst, next.sends!, entrySeq))
      if (next.events.length > 0) defer(() => deliverEvents(inst, next.events, entrySeq))
      return
    }
    next.commands.forEach((command, index) =>
      issue(inst, command, { seq: entrySeq, index }, initial ? index : undefined)
    )
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
    const bound = componentQueries.boundOf(inst.component)
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
    const def = Query.defOf(field.query)
    if (list.op === "reset") return cache.reset(def, args)
    const go = (envCtx: Context.Context<any>) => {
      if (inst.closed) return
      const fetcher = Context.getOption(envCtx, field.query as any)
      // The watch reports a `Query` nothing provides.
      if (Option.isNone(fetcher)) return
      let cancel: (() => void) | undefined
      let done = false
      cancel = cache.loadMore(def, args, fetcher.value as any, () => {
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
      reportsDue.add(owner)
      wake()
    }
  }
  /**
   * Reads every current report of an owner, once nothing is left to render, and dispatches what
   * `collects.onChange` returns for them when it differs from what it last returned. The first comparison is
   * with its message for no reports, so readers that mount reporting nothing new send nothing.
   */
  const deliverReports = (owner: Instance) => {
    reportsDue.delete(owner)
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
    inst.outbox = []
    if (!countSends(inst, "its children")) return
    for (const { issued, send } of outbox) {
      if (inst.closed) return
      // A headless instance wrote none of the tree it renders, so it has no children to send to.
      const child = inst.owner === undefined ? findChild(inst.rendered, send.ref.key) : undefined
      const reason: MessageLog.SendDropped["reason"] | undefined = child === undefined
        ? "unrendered"
        : child._tag === "Fallback"
        ? (child.failure !== undefined ? "failed" : "fallback")
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
        if (command.service !== undefined) {
          try {
            handle = cache.beginRun({
              command: command.name,
              invalidates: command.invalidates as ReadonlyArray<Query.Target>,
              optimistic: command.optimistic as ReadonlyArray<Query.Patch>,
              afterRefetch: command._tag === "Effect" && command.afterRefetch !== undefined
            })
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
          cancelWait: undefined
        }
        inst.runs.push(run)
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
          return run.handle === undefined
            ? work
            : run.handle.run(
              work,
              command.writes as ((success: unknown) => ReadonlyArray<Query.Write>) | undefined
            )
        }
      )
      const fiber = fork(context, Effect.onExit(program, (exit) => Scope.close(scope, exit)))
      run.fiber = fiber
      track(liveRuns, fiber)
      fiber.addObserver((exit) => ended(inst, run, exit, source))
    }
    // After a handled Layer failure, work runs against the parent's services. A run issued before a
    // keyed provide's due read starts against the selection the read leaves.
    onceSelected(inst, go, () => stopRun(inst, run))
  }

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
    const ended = (by: MessageLog.WaitEnded) => {
      endWait(run, by)
      defer(() => release(inst, run))
    }
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
    })

  /** `h.isRunning` for one instance: a run of the Command in the schedule, of the group if given. */
  const runningOf = (inst: Instance) => (name: string, groupKey: string | undefined): boolean =>
    inst.runs.some((run) => run.command.name === name && (groupKey === undefined || run.command.groupKey === groupKey))

  // -- Subscriptions --------------------------------------------------------
  // On the server: whether the root's Subscriptions were sampled for their checks.
  let rootChecked = false
  /** `watchesOnly`: before the first render, when only the cache watchers register. */
  const syncSubscriptions = (inst: Instance, watchesOnly = false) => {
    const subscriptions = inst.component.subscriptions
    const bound = componentQueries.boundOf(inst.component)
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
      const marker = componentQueries.markerOf(subscription)
      const group = marker === undefined ? componentQueries.groupOf(subscription) : undefined
      if (marker !== undefined) {
        if (!markers.has(subscription.key)) markers.set(subscription.key, marker)
      } else if (group !== undefined) syncGroup(inst, group)
      else if (componentQueries.isWatchKey(subscription.key)) {
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
      if (subscriptions.has(key)) continue
      const { deps, name } = subscription
      const running: SubscriptionRun = {
        name,
        deps,
        scope: Scope.forkUnsafe(inst.scope, "sequential"),
        fiber: undefined
      }
      subscriptions.set(key, running)
      record(inst, { _tag: "SubscriptionStarted", key, name, deps })
      const go = (envCtx: Context.Context<any>) => {
        if (inst.closed || subscriptions.get(key) !== running) return
        const source: MessageLog.Source = { _tag: "Subscription", key, name, deps }
        const context = withCache(
          Context.add(Context.add(envCtx, Scope.Scope, running.scope), services.CurrentRoot, () => handle)
        )
        // Attached to its source, it dispatches synchronously, and only its first check waits.
        const current = () => !inst.closed && subscriptions.get(key) === running
        const attachedTo = (subscription as services.Direct)[services.direct]?.(context, (message, accepted) => {
          if (!current()) return
          accepted()
          inst.dispatch(message, source)
        }, (cause) => {
          if (current()) failInstance(inst, cause, "subscription", key)
        })
        if (attachedTo !== undefined) addFinalizer(running.scope, Effect.sync(attachedTo.close))
        const fiber = forkLater(
          context,
          attachedTo !== undefined
            ? attachedTo.initial
            : Stream.runForEach(subscription.stream, (message) => Effect.sync(() => inst.dispatch(message, source)))
        )
        running.fiber = fiber
        interruptOnClose(running.scope, fiber)
        // A Stream that ends stays stopped until its key leaves and comes back.
        fiber.addObserver((exit) => {
          if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
            failInstance(inst, exit.cause, "subscription", key)
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
      const def = Query.defOf(marker.query)
      const logKey = marker.argsKey === undefined
        ? key
        : Subscription.keyOf(`~query/${marker.name}`, def.logKey(marker.args, marker.argsKey))
      const running: WatchRun = { marker, logKey, handle: undefined, released: false, debounce: undefined }
      holdsWatchers = true
      watches.set(key, running)
      // A disabled query: the marker is inert.
      if (marker.argsKey === undefined) continue
      inst.watched?.add(entryKey(def.name, marker.argsKey))
      const entry = { args: marker.args, argsKey: marker.argsKey }
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
          last !== undefined && last.patched === patched && Query.sameMore(last.more, more) &&
          Equal.equals(last.result, result)
        ) return
        last = { result, patched, more }
        if (marker.keyed) {
          const run = inst.keyed!.get(marker.name)!
          run.values.set(entry.argsKey, { args: entry.args, result, patched })
          run.changes.add(entry.argsKey)
          return requestKeyed(inst)
        }
        const bound = componentQueries.boundOf(inst.component)!
        const query = bound.byName.get(marker.name)!
        // It may run inside another instance's `update`: a patch registered at issue reaches every
        // watcher before that `update` returns.
        writeResult(inst, query, bound.snapshot(query, entry, result, patched, more), [], logKey)
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
        const handle = cache.watch(
          def,
          marker.args,
          fetcher.value as (args: any) => Effect.Effect<any, any>,
          send,
          (cause) => {
            // A defect in a fetcher fails every watching instance. The cache never stores it.
            if (!running.released) failInstance(inst, cause, "subscription", logKey)
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
      // Its first value is folded when it registers: there is no loop to wait for.
      running.debounce = forkNow(
        ctx,
        Effect.andThen(
          Effect.sleep(Duration.millis(marker.debounce)),
          Effect.sync(() => {
            running.debounce = undefined
            start()
          })
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
    const info = cache.inspect(def, args)
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
    const held = Query.snapshotMapData(inst.results?.[group.name])
    let prune = false
    for (const key of held?.entries.keys() ?? []) {
      if (!declared.has(key)) {
        prune = true
        break
      }
    }
    run.changes.clear()
    if (!prune && changes.length === 0) return false
    const bound = componentQueries.boundOf(inst.component)!
    const query = bound.byName.get(group.name)!
    const snapshot = bound.snapshotMany(
      query,
      group.entries.flatMap((entry) => {
        const value = run.values.get(entry.argsKey)
        return value === undefined ? [] : [bound.snapshot(query, entry, value.result, value.patched, undefined)]
      })
    )
    writeResult(inst, query, snapshot, changes, run.logKey)
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
    const bound = componentQueries.boundOf(inst.component)!
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
  /** Registers, updates or drops the instance's declaration. The latest `subscriptions` run's map wins. */
  const syncPrefetch = (inst: Instance, declaration: services.Prefetch | undefined) => {
    if (declaration === undefined || hooks === undefined) return releasePrefetch(inst)
    if (inst.prefetch !== undefined) {
      inst.prefetch.declaration = declaration
      return
    }
    // The printed routes the declaration ran for, and when: an intent within 30 seconds of a run is dropped.
    const ran = new Map<string, number>()
    const state: NonNullable<Instance["prefetch"]> = {
      declaration,
      release: hooks.declare({
        routes: () => state.declaration.routes,
        run: (route, intent) => {
          if (inst.closed || inst.failure !== undefined) return undefined
          const now = clock.currentTimeMillisUnsafe()
          for (const [key, at] of ran) if (now - at >= intentGuardMillis) ran.delete(key)
          const printed = state.declaration.routes.print(route)
          if (intent && ran.has(printed)) return undefined
          ran.set(printed, now)
          return runDeclaration(inst, state.declaration, route, intent)
        }
      })
    }
    holdsWatchers = true
    inst.prefetch = state
  }
  const releasePrefetch = (inst: Instance) => {
    const prefetch = inst.prefetch
    if (prefetch === undefined) return
    inst.prefetch = undefined
    prefetch.release()
  }

  interface WalkedPage {
    readonly name: string
    /** The entries the walk prefetched, by entry key. */
    readonly entries: Map<string, { readonly query: string; readonly logKey: string }>
  }

  /**
   * Runs a declaration for a route in the declarer's context: every page is walked and its queries
   * prefetched. A navigation gets the check to run once it settles.
   */
  const runDeclaration = (
    inst: Instance,
    declaration: services.Prefetch,
    route: { readonly _tag: string },
    intent: boolean
  ): services.PrefetchCheck | undefined => {
    // A declarer whose own Layer is still building, or failed, sees none of its queries yet.
    const envCtx = inst.env.ctx
    if (envCtx === undefined) return undefined
    const handler = declaration.map[route._tag]
    if (handler === undefined) return undefined
    let pages: ReadonlyArray<services.Page>
    try {
      pages = handler(route)
    } catch (error) {
      report(prefetchThrew(inst, `Router.prefetch ${route._tag}`, error))
      return undefined
    }
    if (intent) {
      for (const page of pages) walkPage(inst, envCtx, page)
      return undefined
    }
    const since = { born: instancesMade, build: builds }
    const walked = pages.map((page) => walkPage(inst, envCtx, page))
    // Records the watches of the instances created from here until the check ends.
    recording++
    let open = true
    const end = () => {
      if (!open) return
      open = false
      if (--recording > 0) return
      for (const at of recorded) at.watched = undefined
      recorded.clear()
    }
    return {
      settled: () => {
        try {
          checkPrefetch(inst, walked, since)
        } finally {
          end()
        }
      },
      dropped: end
    }
  }

  const prefetchThrew = (inst: Instance, page: string, error: unknown) =>
    new Router.PrefetchThrew({
      message: `${inst.path}: ${page} threw while Router.prefetch walked it, so the rest of its walk was skipped`,
      path: inst.path,
      page,
      error
    })

  /**
   * Walks one page with no instance: `init` with its props, its Commands discarded, then what its
   * queries would watch first, then its initial view, recursing into component children. A throw stops
   * the page's walk. The declarer is unaffected.
   */
  const walkPage = (inst: Instance, envCtx: Context.Context<any>, page: services.Page): WalkedPage => {
    const component = page.component as Component.Any
    const walked: WalkedPage = { name: component.definition.name, entries: new Map() }
    const visit = (component: Component.Any, props: unknown, provided: boolean) => {
      // Behind a `provide`, a query the declarer can't see may be given below it: the skip is silent.
      const behind = provided || component.layer !== undefined
      const model = component.init(props).model
      const bound = componentQueries.boundOf(component)
      if (bound !== undefined) {
        const context = bound.context(model, props, undefined)
        for (const field of bound.entries) {
          const current = context.argsOf(field.name)
          const entries: ReadonlyArray<componentQueries.Keyed> = current.entries ??
            (current.argsKey === undefined ? [] : [{ args: current.args, argsKey: current.argsKey }])
          if (entries.length === 0) continue
          const def = Query.defOf(field.query)
          const fetcher = Context.getOption(envCtx, field.query as any)
          if (Option.isNone(fetcher)) {
            if (!behind) {
              report(
                new Router.PrefetchQueryNotProvided({
                  message: `${inst.path}: Router.prefetch skipped the query ${
                    JSON.stringify(def.name)
                  } of ${component.definition.name}, because the declaring component can't see it. Provide it at the declarer.`,
                  path: inst.path,
                  page: walked.name,
                  query: def.name
                })
              )
            }
            continue
          }
          for (const entry of entries) {
            cache.prefetch(def, entry.args, fetcher.value as (args: any) => Effect.Effect<any, any>)
            walked.entries.set(entryKey(def.name, entry.argsKey), {
              query: def.name,
              logKey: def.logKey(entry.args, entry.argsKey)
            })
          }
        }
      }
      const visitNode = (node: View.Node<any, any>): void => {
        switch (node._tag) {
          case "Text":
          case "Outlet":
            return
          case "Element":
            for (const child of node.children) visitNode(child)
            return
          case "Child":
            // What the parent passed for the child's slots is the parent's, whether the child places it.
            for (const child of View.slotNodes(node)) visitNode(child)
            // A feature has no implementation until its Layer is built.
            if (Feature.isService(node.component)) return
            // A headless child's view is a closure over its parts, which this walk doesn't run.
            if (node.view !== undefined) return
            return visit(node.component, node.props, behind)
        }
      }
      visitNode(component.view(model, props, undefined, undefined, undefined, shared))
    }
    // A page that reads shared state reads the owners above the declarer: the walk doesn't run the
    // closures of the headless components in the page, owners among them.
    const shared: Component.SharedLookup = (owner) => {
      const at = nearestOwner(inst, owner.definition)
      if (at !== undefined) return at.shares
      throw new Error(`${owner.definition.name} isn't above ${inst.path}, so its shared state can't be read`)
    }
    try {
      visit(component, page.props, false)
    } catch (error) {
      report(prefetchThrew(inst, component.definition.name, error))
    }
    return walked
  }

  /**
   * Checks prefetch declarations after navigation settles, matching pages by component name.
   * Reports unmounted pages and checks new instances against their recorded watches; older
   * instances are skipped. Skips the entire check if a Layer build begun since navigation failed.
   *
   * Walks the tree only for pages with no new instance, at most once per check.
   */
  const checkPrefetch = (
    inst: Instance,
    pages: ReadonlyArray<WalkedPage>,
    since: { readonly born: number; readonly build: number }
  ) => {
    if (lastFailedBuild > since.build) return
    const fresh = new Map<string, Array<Instance>>()
    for (const at of recorded) {
      if (at.closed || at.born <= since.born) continue
      const found = fresh.get(at.component.definition.name)
      if (found === undefined) fresh.set(at.component.definition.name, [at])
      else found.push(at)
    }
    let mounted: Set<string> | undefined
    const mountedNames = () => {
      if (mounted !== undefined) return mounted
      const names = new Set<string>()
      const collect = (at: Instance) => {
        if (at.closed) return
        names.add(at.component.definition.name)
        for (const child of at.children) collect(child)
      }
      collect(root)
      return mounted = names
    }
    for (const page of pages) {
      const found = fresh.get(page.name)
      if (found === undefined) {
        // Older than the navigation, it is skipped. None at all is reported.
        if (mountedNames().has(page.name)) continue
        report(
          new Router.PrefetchPageNotMounted({
            message: `${inst.path}: Router.prefetch declared the page ${page.name}, and none was mounted`,
            path: inst.path,
            page: page.name
          })
        )
        continue
      }
      // Every instance below a fresh one is fresh too, so its watches were recorded.
      const watched = new Set<string>()
      const gather = (at: Instance) => {
        if (at.watched !== undefined) { for (const key of at.watched) watched.add(key) }
        for (const child of at.children) gather(child)
      }
      for (const at of found) gather(at)
      for (const [key, entry] of page.entries) {
        if (watched.has(key)) continue
        report(
          new Router.PrefetchEntryNotWatched({
            message:
              `${inst.path}: Router.prefetch fetched ${entry.logKey} for ${page.name}, and the page never watched it`,
            path: inst.path,
            page: page.name,
            query: entry.query,
            logKey: entry.logKey
          })
        )
      }
    }
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
        return releaseRendered(rendered.inner)
      case "Element": {
        for (const child of rendered.children) releaseRendered(child)
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
        return firstDefined(rendered.children, (child) => findRef(child, key, who, author))
      }
      case "Fallback":
        return findRef(rendered.inner, key, who, author)
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
          const node = inst.closed
            ? undefined
            : firstDefined(inst.rendered, (rendered) => findRef(rendered, ref.key, inst, inst.author))
          resume(Effect.succeed(Option.fromUndefinedOr(node as Node | undefined)))
        })
      })
  })

  // Mount Scopes of removed elements. Closing a Scope is asynchronous, so a mount that was waiting
  // for its commit or its Layer checks this before it starts.
  const removedMounts = new WeakSet<Scope.Closeable>()

  /**
   * `inst` is whose mount it is: it gets the message, and the failure. The Scope is forked from
   * `under`, the instance rendering the element, so the mount ends with that instance too.
   */
  const startMount = (
    inst: Instance,
    mount: View.Mount<any>,
    node: unknown,
    env: Env,
    under: Instance = inst
  ): RunningMount | undefined => {
    if (!host.runsMounts) return undefined
    const mountScope = Scope.forkUnsafe(under.scope, "sequential")
    const running: RunningMount = { scope: mountScope, mount, pubsub: undefined }
    // A mount that never reads its args' changes pays nothing for them.
    const changes = Stream.suspend(() => {
      let pubsub = running.pubsub
      if (pubsub === undefined) {
        pubsub = running.pubsub = Effect.runSync(PubSub.sliding<unknown>({ capacity: 1, replay: 1 }))
        PubSub.publishUnsafe(pubsub, running.mount.args)
        addFinalizer(mountScope, PubSub.shutdown(pubsub))
      }
      return Stream.fromPubSub(pubsub)
    })
    afterCommit(() =>
      whenReady(env, (envCtx) => {
        if (inst.closed || removedMounts.has(mountScope)) return
        const send = (result: unknown) =>
          Effect.sync(() => {
            // The latest render's map, so what it closes over is current.
            const latest = running.mount
            const message = latest.resolve(result as never)
            // A result mapped to `Component.noop` sends nothing, and logs nothing.
            if (isNoop(message)) return
            inst.dispatch(message, {
              _tag: "Mount",
              name: latest.name,
              args: latest.args,
              argsSchema: latest.argsSchema
            })
          })
        const fiber = forkNow(
          withCache(Context.add(Context.add(envCtx, Scope.Scope, mountScope), services.Refs, refsOf(inst))),
          Effect.suspend(() => mount.run(node, running.mount.args, changes, send))
        )
        interruptOnClose(mountScope, fiber)
        fiber.addObserver((exit) => {
          if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
            failInstance(inst, exit.cause, "mount", mount.name)
          }
        })
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
    if (running.pubsub === undefined || Mount.sameArgs(previous, mount)) return
    // `publishUnsafe` drops a value when the buffer is full. `publish` slides it out, and never suspends.
    Effect.runSync(PubSub.publish(running.pubsub, mount.args))
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
    removedMounts.add(running.scope)
    closeUnder(under, running.scope)
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
    if (owner === undefined) {
      return guard(
        inst,
        "view",
        () =>
          checked(
            inst,
            inst.component.view(inst.model, inst.props, runningOf(inst), inst.results, inst.path, sharedOf(inst))
          )
      )
    }
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

  /** Checks a fresh view's child paths, which its fallbacks are checked against as they're shown. */
  const checked = (inst: Instance, tree: View.Node<any, any>): View.Node<any, any> => {
    inst.childPaths = checkChildPaths(inst.path, tree)
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
      checkAuthorRefs(author.path, written)
      checkAuthorPlacements(author.path, written)
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
    if (!inst.closed) updateHead(inst)
    deliverSends(inst)
  }

  const create = (inst: Instance, view: View.Node<any, any>, env: Env): Rendered => {
    switch (view._tag) {
      case "Text":
        return { _tag: "Text", v: view, node: host.createText(view.text) }
      case "Element": {
        const node = host.createElement(view.tag)
        const attrs = view.attrs
        if (attrs !== View.noFields) { for (const name in attrs) host.setAttr(node, name, attrs[name]) }
        setEvents(inst, node, view)
        const views = view.children
        checkKeys(inst, views)
        const children: Array<Rendered> = new Array(views.length)
        // The element is new and empty, so its children go in as they are made, without reading the host.
        for (let index = 0; index < views.length; index++) {
          insertNodes(node, children[index] = create(inst, views[index]!, env), undefined)
        }
        // Properties go after the children, so a `select`'s `value` has its options to match.
        const props = view.props
        if (props !== View.noFields) { for (const name in props) host.setProp(node, name, props[name]) }
        return {
          _tag: "Element",
          v: view,
          node,
          children,
          mount: view.mount !== undefined ? startMount(inst.author, view.mount, node, env, inst) : undefined,
          ownedMounts: startOwnedMounts(inst, view, node, env)
        }
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
      const plan = range === undefined ? undefined : matchList(out, views, range.nodes)
      const rendered: Array<Rendered> = new Array(views.length)
      if (plan !== undefined) {
        // Adopted: the markers go, and the server's nodes are the content's.
        for (let index = 0; index < views.length; index++) {
          rendered[index] = adoptNode(out, views[index]!, plan[index]!, out.env)
        }
        host.remove(range!.open)
        host.remove(range!.close)
      } else {
        // Built fresh: the server's nodes go, and the parent places the new ones.
        if (range !== undefined) removeRange(range)
        for (let index = 0; index < views.length; index++) rendered[index] = create(out, views[index]!, out.env)
      }
      out.rendered = rendered
    } catch (error) {
      contentFailed(out, error)
      out.rendered = [{ _tag: "Text", v: emptyText, node: host.createText("") }]
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
    const out: Instance = {
      path: outletPath(receiver, name),
      born: ++instancesMade,
      depth: parent.depth + 1,
      component: outletComponent,
      parent,
      author,
      owner: undefined,
      content: undefined,
      scope: Scope.forkUnsafe(parent.scope, "sequential"),
      env: slotted.env,
      selection: undefined,
      children: noChildren,
      props: undefined,
      model: undefined,
      results: undefined,
      shares: undefined,
      readers: undefined,
      owning: undefined,
      owners: undefined,
      seen: undefined,
      head: [],
      onEmit: ignoreEvents,
      onFailure: undefined,
      failure: undefined,
      childPaths: undefined,
      clash: undefined,
      rendered: [],
      get closed() {
        return isClosed(this.scope) || this.parent?.closed === true
      },
      waiting: false,
      // The content's children adopt the server's state when the instance placing it and the one that
      // wrote it both did.
      adoptsChildren: parent.adoptsChildren && author.adoptsChildren,
      snapshot: undefined,
      deferred: false,
      runs: [],
      left: false,
      closes: undefined,
      subscriptions: undefined,
      watches: undefined,
      watchesSynced: false,
      watched: undefined,
      prefetch: undefined,
      keyed: undefined,
      keyedQueued: false,
      loadMores: undefined,
      mounting: undefined,
      outbox: [],
      dispatch: author.dispatch,
      fire: author.fire
    }
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
      out.childPaths = checkContentPaths(out.path, views)
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

  const createChild = (inst: Instance, view: View.Child<any, any>, env: Env, range?: Range): Rendered => {
    const target = view.component
    if (Feature.isService(target) && env.ctx === undefined) {
      // The feature's service comes from a Layer that is still building, or failed. The child shows
      // `fallback`, rendered against the nearest settled Env, and re-renders when the Layer settles.
      if (view.fallback === undefined) {
        throw new Error(
          `${inst.path}: ${target.key} isn't available, because a Layer above it is still building or failed. Pass \`fallback\` to the feature's \`render\`.`
        )
      }
      if (env.failure === undefined) {
        const rerender = () => {
          if (!inst.closed) markDirty(inst)
        }
        whenReady(env, rerender, rerender)
      }
      if (range !== undefined) removeRange(range)
      return {
        _tag: "Fallback",
        v: view,
        inner: create(inst, fallbackOf(inst, view, env), settled(env)),
        failure: undefined
      }
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
    const path = `${inst.path}/${segment(view)}`
    const child = makeInstance(
      component,
      view.props,
      path,
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
    return { _tag: "Child", v: view, inst: child }
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

  /** What a feature child shows while its Layer is building or failed. */
  const fallbackOf = (inst: Instance, view: View.Child<any, any>, env: Env): View.Node<any, any> =>
    shownIn(
      inst,
      view,
      // As in `fallbackFor`: the fallback is its author's code, so one that throws fails its author.
      guard(inst.author, "fallback", () => View.toNode(view.fallback!(unavailable(env)))) ?? emptyText
    )

  /** What a failed child shows. A fallback that throws fails `inst` with source `fallback`. */
  const fallbackFor = (inst: Instance, view: View.Child<any, any>, failure: Cause.Cause<unknown>) =>
    shownIn(
      inst,
      view,
      // The fallback was written by the author of the tree it sits in.
      guard(inst.author, "fallback", () =>
        view.fallback !== undefined ? View.toNode(view.fallback(AsyncResult.failure(failure))) : emptyText) ??
        emptyText
    )

  const failedChild = (
    inst: Instance,
    view: View.Child<any, any>,
    failure: Cause.Cause<unknown>,
    env: Env
  ): Rendered => {
    const shown = fallbackFor(inst, view, failure)
    return { _tag: "Fallback", v: view, inner: create(inst, shown, settled(env)), failure }
  }

  // -- hydration ------------------------------------------------------------
  /** The range that starts at `open`, the marker for `path`, up to its closing marker. */
  const rangeFrom = (open: unknown, path: string): Range | undefined => {
    const nodes: Array<unknown> = []
    for (let node = host.nextOf(open); node !== undefined; node = host.nextOf(node)) {
      const kind = hydration!.inspect(node)
      if (kind._tag === "Close" && kind.path === path) return { open, close: node, nodes, claimed: false }
      nodes.push(node)
    }
    return undefined
  }

  const removeRange = (range: Range) => {
    host.remove(range.open)
    for (const node of range.nodes) host.remove(node)
    host.remove(range.close)
  }

  const childNodes = (node: unknown): Array<unknown> => {
    const out: Array<unknown> = []
    for (let child = hydration!.firstChild(node); child !== undefined; child = host.nextOf(child)) out.push(child)
    return out
  }

  /**
   * Matches a view against the server's nodes: the instance's own nodes one by
   * one, and each child by its marker range, which the child matches
   * itself. A server never writes an empty text node, so an empty text matches
   * nothing and is created.
   */
  const matchList = (
    inst: Instance,
    views: ReadonlyArray<View.Node<any, any>>,
    nodes: ReadonlyArray<unknown>
  ): Array<Plan> | undefined => {
    const out: Array<Plan> = []
    let index = 0
    for (const view of views) {
      const node = nodes[index]
      const kind = node === undefined ? undefined : hydration!.inspect(node)
      switch (view._tag) {
        case "Text": {
          if (kind?._tag === "Text") {
            if (kind.text !== view.text) return undefined
            out.push({ _tag: "Text", node })
            index++
          } else if (view.text === "") {
            out.push({ _tag: "Text", node: undefined })
          } else {
            return undefined
          }
          break
        }
        case "Element": {
          if (kind?._tag !== "Element" || kind.tag !== view.tag) return undefined
          // Content the host parses as text has no nodes or markers to adopt, so its children are built fresh.
          const children = kind.textOnly === true ? undefined : matchList(inst, view.children, childNodes(node))
          if (children === undefined && kind.textOnly !== true) return undefined
          out.push({ _tag: "Element", node, children })
          index++
          break
        }
        case "Child":
        case "Outlet": {
          // An outlet's content matches itself against the range, as a child does, and builds fresh if it can't.
          const path = view._tag === "Child" ? `${inst.path}/${segment(view)}` : outletPath(inst.author, view.name)
          if (kind?._tag !== "Open" || kind.path !== path) return undefined
          const range = rangeFrom(node, path)
          if (range === undefined) return undefined
          out.push({ _tag: "Child", range })
          index += range.nodes.length + 2
          break
        }
      }
    }
    return index === nodes.length ? out : undefined
  }

  /** Like `create`, but takes the server's nodes a matched view points at. */
  const adoptNode = (inst: Instance, view: View.Node<any, any>, plan: Plan, env: Env): Rendered => {
    switch (view._tag) {
      case "Text": {
        const node = (plan as Extract<Plan, { _tag: "Text" }>).node
        return { _tag: "Text", v: view, node: node ?? host.createText(view.text) }
      }
      case "Element": {
        const { children: plans, node } = plan as Extract<Plan, { _tag: "Element" }>
        for (const name in view.attrs) {
          if (hydration!.getAttr(node, name) !== view.attrs[name]) host.setAttr(node, name, view.attrs[name])
        }
        setEvents(inst, node, view)
        if (plans === undefined) { for (const child of childNodes(node)) host.remove(child) }
        checkKeys(inst, view.children)
        const children = plans === undefined
          ? view.children.map((child) => create(inst, child, env))
          : view.children.map((child, index) => adoptNode(inst, child, plans[index]!, env))
        place(node, children, undefined)
        for (const name in view.props) adoptProp(node, name, view.props[name])
        return {
          _tag: "Element",
          v: view,
          node,
          children,
          mount: view.mount !== undefined ? startMount(inst.author, view.mount, node, env, inst) : undefined,
          ownedMounts: startOwnedMounts(inst, view, node, env)
        }
      }
      case "Child":
        return createChild(inst, view, env, (plan as Extract<Plan, { _tag: "Child" }>).range)
      case "Outlet":
        return createOutlet(inst, view, (plan as Extract<Plan, { _tag: "Child" }>).range)
    }
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
        return (rendered._tag === "Child" || rendered._tag === "Fallback") && rendered.v.component === view.component &&
          rendered.v.key === view.key
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
    if (matched < oldLength) {
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
      if (old._tag === "Element") releaseRemoved(old.children, (view as View.Element<any, any>).children)
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

  const patchElement = (
    inst: Instance,
    rendered: Extract<Rendered, { readonly _tag: "Element" }>,
    element: View.Element<any, any>,
    env: Env
  ): void => {
    const prev = rendered.v
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
    if (children.length > 0 || element.children.length > 0) {
      rendered.children = patchList(inst, node, children, element.children, undefined, env)
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
      case "Fallback": {
        const child = view as View.Child<any, any>
        if (rendered.failure !== undefined) {
          const shown = fallbackFor(inst, child, rendered.failure!)
          return {
            _tag: "Fallback",
            v: child,
            inner: patchOrReplace(inst, rendered.inner, shown, settled(env)),
            failure: rendered.failure
          }
        }
        if (env.ctx !== undefined) {
          // Ready now: the fallback goes, and the feature mounts in its place.
          destroy(inst, rendered.inner)
          return createChild(inst, child, env)
        }
        const shown = fallbackOf(inst, child, env)
        return {
          _tag: "Fallback",
          v: child,
          inner: patchOrReplace(inst, rendered.inner, shown, settled(env)),
          failure: undefined
        }
      }
      case "Outlet": {
        const out = rendered.inst
        const outlet = outletOf.get(out)!
        // Moved between an element that holds text and one that can't: its content is checked again.
        const moved = outlet.view.noText !== (view as View.Outlet).noText
        outlet.view = rendered.v = view as View.Outlet
        if (moved || isStale(out, outlet)) renderOutlet(out)
        return rendered
      }
      case "Child": {
        const child = view as View.Child<any, any>
        const instance = rendered.inst
        if (instance.closed) {
          for (const node of nodesOf(rendered)) host.remove(node)
          // Failed: the child shows its fallback until the key changes.
          if (instance.failure !== undefined) return failedChild(inst, child, instance.failure, env)
          return createChild(inst, child, env)
        }
        instance.onEmit = child.onEmit
        instance.onFailure = child.onFailure
        // Read first: most children are passed no slots, and this is cheaper than the map.
        const slotted = child.slots !== undefined || rendered.v.slots !== undefined
          ? slottedBy.get(instance)
          : undefined
        if (slotted !== undefined) slotted.values = child.slots
        const changed = !propsEqual(child.props, instance.props)
        if (changed) {
          instance.props = child.props
          if (instance.selection !== undefined) instance.selection.due = true
          // Before the result writes the new props cause, so a replay opens them against these props.
          const changedSeq = record(instance, { _tag: "PropsChanged", props: child.props })
          // Watches first: new args over a settled entry write its value before this render, and the
          // keyed queries' results are written before it too.
          syncSubscriptions(instance)
          drainKeyed(instance)
          if (!instance.closed) refreshShares(instance, changedSeq)
        }
        // A headless child's view is the closure, which is new on every render of whoever declared it.
        if (instance.owner !== undefined) instance.content = child.view
        if ((changed || instance.owner !== undefined) && !instance.closed) {
          dirty.delete(instance)
          render(instance)
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
      case "Text": {
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
      if (item._tag === "Element" || item._tag === "Text") {
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

  /** Puts an item's nodes before `ref`, in their order, without collecting them. */
  const insertNodes = (parentNode: unknown, rendered: Rendered, ref: unknown): void => {
    switch (rendered._tag) {
      case "Element":
      case "Text":
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

  const closeAll = (inst: Instance, rendered: Rendered): void => {
    switch (rendered._tag) {
      case "Outlet":
      case "Child": {
        inst.children.delete(rendered.inst)
        headDirty = true
        releaseWatches(rendered.inst)
        leave(rendered.inst)
        closeUnder(inst, rendered.inst.scope)
        return
      }
      case "Fallback":
        return closeAll(inst, rendered.inner)
      case "Element": {
        // The element's `onMount` work ends with it.
        stopMount(inst, rendered.mount)
        if (rendered.ownedMounts !== undefined) {
          for (const entry of rendered.ownedMounts) stopMount(inst, entry.running)
        }
        for (const child of rendered.children) closeAll(inst, child)
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

  // -- root -----------------------------------------------------------------
  recordTree({ _tag: "SessionStarted", app: component.definition.name })
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
      if (merged !== Head.empty) {
        merged = Head.empty
        host.head?.(merged)
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
        rootRange = rangeFrom(node, rootPath)
        break
      }
    }
    if (rootRange !== undefined) rootRef = host.nextOf(rootRange.close)
  }
  const root = makeInstance(
    component,
    rootProps,
    rootPath,
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
  if (root.failure === undefined) place(container, root.rendered, rootRef)
  started = true
  if (waiting === 0 && !adoptedDone) {
    adoptedDone = true
    hydrating = undefined
    reportPending = true
  }
  // Mounting drains like a flush, so failures it causes (a title template that throws included) settle
  // before the snapshots do. `onMount` work runs after the commit, so its updates come later.
  drain()
  settleSnapshots()
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
      navigated: () => cache.closeWindow(),
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

  /** A `Redacted` in an instance's state defers it and its subtree, so the client builds them fresh. */
  const warnRedacted = (inst: Instance) => {
    if (warnedRedacted.has(inst.component)) return
    warnedRedacted.add(inst.component)
    forkNow(
      ctx,
      Effect.logWarning(
        `${inst.component.definition.name}: its state holds a Schema.Redacted, so the server sends no state for it and the ` +
          "client builds it and everything under it fresh, without hydration. Keep the secret in a leaf component " +
          "or in a service."
      )
    )
  }

  /** Serialises the tree once, in document order, with the state the client adopts. */
  const finish = () => {
    if (scheduled || dirty.size > 0 || deferred.length > 0 || reportsDue.size > 0) flush()
    frozen = true
    server?.onFinish?.(cache)
    // In the same synchronous step as the Models: fetches in flight are interrupted, and their entries
    // revert to cold and aren't shipped. Nothing is dispatched for them.
    const query = cache.dehydrate()
    const state: Record<string, unknown> = {}
    const collected: Record<string, unknown> = {}
    const deferredPaths: Array<string> = []
    // `under`: inside a deferred instance, whose subtree the client builds fresh.
    const instance = (inst: Instance, under: boolean): Renderer.ServerNode => {
      let inner = under
      if (!under) {
        const codec = stateCodecOf(inst.component)
        let encoded = inst.failure !== undefined ||
            inst.deferred ||
            (inst.component.layer !== undefined && inst.env.ctx === undefined)
          ? Option.none()
          : codec.encode(inst.model, inst.results)
        if (codec.redacted) warnRedacted(inst)
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
        }
      }
      return {
        _tag: "Range",
        path: inst.path,
        children: inst.failure !== undefined ? [] : inst.rendered.map((rendered) => serialize(inst, rendered, inner))
      }
    }
    const serialize = (inst: Instance, rendered: Rendered, under: boolean): Renderer.ServerNode => {
      switch (rendered._tag) {
        case "Text":
          return { _tag: "Text", text: rendered.v.text }
        case "Element":
          return {
            _tag: "Element",
            tag: rendered.v.tag,
            attrs: rendered.v.attrs,
            props: rendered.v.props,
            children: rendered.children.map((child) => serialize(inst, child, under))
          }
        case "Child":
          return instance(rendered.inst, under)
        case "Outlet":
          return {
            _tag: "Range",
            path: rendered.inst.path,
            children: rendered.inst.rendered.map((child) => serialize(rendered.inst, child, under))
          }
        case "Fallback": {
          // A failed child, or a feature whose Layer isn't ready: the client builds it fresh.
          const path = `${inst.path}/${segment(rendered.v)}`
          if (!under) deferredPaths.push(path)
          return { _tag: "Range", path, children: [serialize(inst, rendered.inner, true)] }
        }
      }
    }
    const nodes = [instance(root, false)]
    return {
      nodes,
      state: {
        ...state,
        "~deferred": deferredPaths,
        "~query": query,
        ...(Object.keys(collected).length > 0 ? { "~reported": collected } : {}),
        ...(server?.static === true ? { "~static": true } : {})
      }
    }
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
    cache,
    crashed: () => root.failure,
    flush: () => flushes,
    buildsPendingSince,
    head: () => merged,
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
    finish
  }
}
