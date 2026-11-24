/**
 * Today's runtime surface on the kernel, for the test project that runs the existing tests against it.
 *
 * @internal
 */
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Scheduler from "effect/Scheduler"
import * as Scope from "effect/Scope"
import * as Command from "../../Command.ts"
import type * as Component from "../../Component.ts"
import * as Head from "../../Head.ts"
import type * as Renderer from "../../Renderer.ts"
import * as View from "../../View.ts"
import { routed } from "../due.ts"
import * as Executor from "../executor.ts"
import * as hydrateRun from "../hydrateRun.ts"
import * as Kernel from "../kernel.ts"
import * as messageLog from "../messageLog.ts"
import * as queryCore from "../queryCore.ts"
import * as Recorder from "../recorder.ts"
import type * as routeRun from "../routeRun.ts"
import type * as runtime from "../runtime.ts"
import * as serverHost from "../serverHost.ts"
import * as services from "../services.ts"
import * as transitionRun from "../transitionRun.ts"
import * as domHost from "./domHost.ts"
import * as serialize from "./serialize.ts"

/** @internal */
export type Root = runtime.Root

/** @internal */
export type Instance = runtime.Instance

/** @internal */
export { stateCodecOf } from "../stateCodec.ts"

/**
 * No part is headless yet, so no event has owners.
 *
 * Only the kernel test project calls it, through its alias for `internal/runtime.ts`.
 *
 * @internal
 */
// oxlint-disable-next-line effect/no-unused-internal
export const eventOwners = (
  _handlers: Readonly<Record<string, unknown>>
): Readonly<Record<string, ReadonlyArray<string>>> => View.noFields

const dispatched = { _tag: "Dispatch" } as const

const noCommands: ReadonlyArray<unknown> = []

const neutralFold: View.HeadFold = {
  merge: Head.merge,
  title: (head: Head.Head) => head.title
}

let sessions = 0

const bridge = (
  host: Renderer.Host<any>,
  step: Recorder.Recording["step"],
  ownsHead: boolean
): Kernel.Host => ({
  createElement: (tag) => {
    const node = host.createElement(tag)
    // An entry marks a form as the app's, so its submission is prevented without a handler.
    if (node?.nodeName === "FORM") {
      host.setEvents(node, View.noFields, () => false, View.noFields)
    }
    return node
  },
  createText: (text) => host.createText(text),
  setText: (node, text) => host.setText(node, text),
  setAttr: (node, name, value, previous) =>
    host.setAttr(node, name, value, previous),
  normalizeAttrs: host.normalizeAttrs === undefined
    ? undefined
    : (node, attrs) => host.normalizeAttrs!(node, attrs),
  setProp: (node, name, value) => host.setProp(node, name, value),
  setEvents: (node, rec) => {
    const view = rec.v as View.Element<any, any>
    host.setEvents(
      node,
      view.handlers,
      (event, handler, payload, onMessage) =>
        step(() => {
          const inst = rec.inst
          if (inst.closed) return false
          let message: unknown = handler
          if (typeof handler === "function") {
            try {
              message = handler(payload)
            } catch (error) {
              Kernel.fail(inst, "event", Cause.die(error))
              return false
            }
          }
          if (message === undefined) return false
          onMessage?.()
          Kernel.send(inst, message, event)
          return true
        }),
      view.eventOptions
    )
    host.events?.listen(view.handlers, view.eventOptions)
  },
  insert: (parent, node, before) =>
    host.insertBefore(parent, node, before ?? undefined),
  remove: (_parent, node) => host.remove(node),
  parentOf: (node) => host.parentOf(node),
  nextOf: (node) => host.nextOf(node) ?? null,
  commit: host.commit === undefined ? undefined : () => host.commit!(),
  controlled: host.controlled.size === 0 ? undefined : host.controlled,
  runsMounts: host.runsMounts,
  head: ownsHead && host.head !== undefined
    ? (head) => host.head!(head)
    : undefined,
  transitions: host.viewTransition === undefined
    ? undefined
    : transitionRun.make(host.viewTransition)
})

interface Server {
  readonly host: Renderer.Host<any>
  readonly fetches: boolean
}

interface Options {
  readonly fallback?:
    | ((
      failure: AsyncResult.Failure<never, unknown>,
      h: any
    ) => View.Content<never, any>)
    | undefined
  readonly state?: Renderer.State | undefined
  readonly query?: Renderer.QueryOptions | undefined
  readonly head?: boolean | undefined
  readonly adoptionHead?: boolean | undefined
}

/** The root's query cache, made once `Query` is loaded, and disposed with the root. */
const makeCell = (
  ctx: Context.Context<any>,
  options: Options | undefined,
  server: Server | undefined,
  onMake: (cache: queryCore.Cache) => void
) => {
  let made: {
    readonly cache: queryCore.Cache
    readonly dispose: Effect.Effect<void>
  } | undefined
  const get = () => {
    if (made === undefined) {
      made = queryCore.loaded!.buildCache(ctx, {
        visibility: Context.get(ctx, queryCore.Visibility),
        connectivity: Context.get(ctx, queryCore.Connectivity),
        report: Context.get(ctx, queryCore.Problems),
        idleMs: queryCore.cacheIdleMs(options?.query?.idleTimeToLive),
        settleOnce: server !== undefined,
        fetches: server === undefined || server.fetches
      })
      onMake(made.cache)
    }
    return made.cache
  }
  const cell: queryCore.CacheCell = {
    [queryCore.CacheTypeId]: queryCore.CacheTypeId,
    [queryCore.CacheCellTypeId]: get
  }
  return {
    cell,
    cache: () => queryCore.loaded === undefined ? undefined : get(),
    made: () => made?.cache,
    dispose: Effect.suspend(() => made?.dispose ?? Effect.void)
  }
}

const withProps = <A, E, R>(
  rootProps: unknown,
  f: (props: unknown) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.isEffect(rootProps)
    ? Effect.flatMap(rootProps as Effect.Effect<unknown>, f)
    : f(rootProps)

/**
 * Only the kernel test project calls it, through its alias for `internal/runtime.ts`.
 *
 * @internal
 */
// oxlint-disable-next-line effect/no-unused-internal
export const mount = (
  component: Component.Any,
  rootProps: unknown,
  container: unknown,
  options?: Options
): Effect.Effect<
  Root & Renderer.Root<any, any>,
  never,
  Scope.Scope | Renderer.Renderer
> =>
  withProps(
    rootProps,
    (props) =>
      Effect.uninterruptible(
        Effect.contextWith(
          (ctx: Context.Context<Scope.Scope | Renderer.Renderer>) => {
            const root = start(component, props, container, ctx, options)
            return Effect.as(
              Scope.addFinalizer(Context.get(ctx, Scope.Scope), root.close),
              root.root
            )
          }
        )
      )
  )

const start = (
  component: Component.Any,
  props: unknown,
  container: unknown,
  caller: Context.Context<any>,
  options: Options | undefined,
  server?: Server
) => {
  const ctx = onScheduler(caller)
  const host = server?.host ?? Context.get(ctx, services.Renderer).host
  const log = Context.get(ctx, messageLog.MessageLog)
  const executor = Context.get(ctx, Executor.CurrentExecutor)
  const clock = Context.get(ctx, Clock.Clock)
  const session = `${clock.currentTimeMillisUnsafe().toString(36)}-k${
    (sessions++).toString(36)
  }`
  const emitted: Array<unknown> = []
  let flushes = 0
  // A build that begins between flushes belongs to the next one, which commits what began it.
  let inFlush = true
  const recording = Recorder.make(
    log,
    clock,
    session,
    component.definition.name
  )
  let initCommands: ReadonlyArray<unknown> | undefined
  const state = options?.state
  const fromStatic = state?.["~static"] === true
  const waiting = new Map<Kernel.Instance, Parameters<Kernel.Recorder>[1]>()
  const mountWaiting = (inst: Kernel.Instance) => {
    const draft = waiting.get(inst)
    if (draft === undefined) return
    waiting.delete(inst)
    if (!inst.closed) recording.record(inst, { ...draft, model: inst.model })
    checkAdopted()
  }
  const record: Kernel.Recorder = (inst, draft) => {
    if (initCommands !== undefined && draft._tag === "Mounted") {
      draft = { ...draft, commands: initCommands }
      initCommands = undefined
    }
    if (hydration !== undefined) {
      if (draft._tag === "Mounted" && hydration.adopts(inst)) {
        draft = { ...draft, adopted: true }
        const env = inst.env
        const layered =
          (inst.component as unknown as Component.Any).layer !== undefined &&
          (state!["~status"] as Record<string, unknown> | undefined)
              ?.[inst.path] === undefined
        if (layered || (env.ctx === undefined && env.cause === undefined)) {
          waiting.set(inst, draft)
          const bound = queryCore.boundOf(
            inst.component as unknown as Component.Any
          )
          const seq = recording.record(inst, {
            _tag: "Waiting",
            props: inst.props,
            model: draft.model,
            ...(bound === undefined
              ? undefined
              : { queries: inst.results ?? bound.empty })
          })
          if (!layered) env.waiting.push(() => mountWaiting(inst))
          return seq
        }
      } else if (draft._tag === "LayerPending" && waiting.has(inst)) {
        inst.env.waiting.push(() => mountWaiting(inst))
      } else if (draft._tag === "Unmounted" && waiting.delete(inst)) {
        const seq = recording.record(inst, draft)
        checkAdopted()
        return seq
      }
    }
    if (
      inst.parent === undefined &&
      (draft._tag === "Update" || draft._tag === "Mounted")
    ) {
      emitted.push(...(draft.events as ReadonlyArray<unknown>))
    }
    if (draft._tag === "Mounted" && routing?.restored(inst) === true) {
      draft = { ...draft, adopted: true }
    }
    return recording.record(inst, draft)
  }
  const hooks = Context.getOrUndefined(ctx, services.RootHooks)
  const building = (flush: number) => {
    let count = 0
    const stamps = kernelRoot?.instance.tree.building
    if (stamps !== undefined) {
      for (const stamp of stamps) if (stamp.flush >= flush) count++
    }
    return count
  }
  const routing: routeRun.Routed | undefined = hooks?.kernel?.(hooks, {
    path: "/" + component.definition.name,
    container,
    context: ctx,
    flush: () => flushes,
    flushing: () => inFlush,
    buildsPendingSince: building,
    hydrated: () =>
      kernelRoot !== undefined &&
      hydration?.adopts(kernelRoot.instance) === true,
    static: fromStatic,
    navigated: () => closeWindow()
  })
  const ownsHead = options?.head !== false
  // A browser host runs on the kernel's own DOM host. One a test wraps keeps the bridge to it.
  const dom = domHost.make?.(host, container, {
    head: ownsHead,
    step: recording.step
  })
  const problems = Context.get(ctx, queryCore.Problems)
  const report = (problem: unknown) => {
    try {
      problems(problem as never)
    } catch {
      // A sink can't change what the runtime does.
    }
  }
  const deferred = new Set<Kernel.Instance>()
  const base = dom ?? bridge(host, recording.step, ownsHead)
  const bridged: Kernel.Host = {
    ...base,
    commit: () => {
      base.commit?.()
      for (const inst of waiting.keys()) {
        if (inst.env.ctx !== undefined || inst.env.cause !== undefined) {
          mountWaiting(inst)
        }
      }
      routing?.flushed()
      checkIdle()
    },
    server: server === undefined ? undefined : {
      drop: (inst, name, issued) => {
        if (issued !== undefined) {
          record(inst, {
            _tag: "CommandDropped",
            name,
            issued,
            reason: "server"
          })
        }
        report(
          new Command.ServerCommandIssued({
            path: inst.path,
            command: name,
            message: issued === undefined
              ? `[@effect/ui] ${inst.path}'s update issued ${name} during server rendering, and it was dropped. The server renders a list's first page only.`
              : `[@effect/ui] ${inst.path}'s update issued ${name} during server rendering, and it was dropped. No Command runs on the server: read data with a query.`
          })
        )
      },
      defer: (inst) => {
        deferred.add(inst)
      },
      report
    }
  }
  let started = false
  let firstHeld = 0
  let adoptedDone = state === undefined
  let adoptionHead: unknown
  const adoptedWaiters: Array<() => void> = []
  let windowClosed = false
  const closeWindow = () => {
    windowClosed = true
    queries.made()?.closeWindow()
  }
  const checkAdopted = () => {
    if (
      adoptedDone || !started || waiting.size > 0 ||
      hydration?.settled() === false
    ) return
    adoptedDone = true
    if (firstHeld > 0 || adoptionHead === undefined) adoptionHead = root.head()
    closeWindow()
    for (const f of adoptedWaiters.splice(0)) f()
  }
  const hydration = state === undefined
    ? undefined
    : hydrateRun.make(
      state,
      bridged,
      base,
      domHost.adopt?.(base, container, "/" + component.definition.name),
      checkAdopted
    )
  const hydratedAt = clock.currentTimeMillisUnsafe()
  const idleWaiters: Array<() => void> = []
  let idleCheck = false
  const checkIdle = () => {
    if (idleWaiters.length === 0 || idleCheck) return
    idleCheck = true
    executor.schedule(() => {
      idleCheck = false
      const tree = kernelRoot?.instance.tree
      if (
        tree === undefined || tree.scheduled || tree.dirty.length > 0 ||
        (tree.building?.size ?? 0) > 0
      ) return
      const cache = queries.made()
      if (cache !== undefined && cache.pending().length > 0) return
      for (const f of idleWaiters.splice(0)) f()
    })
  }
  const fallback = options?.fallback
  let frozen = false
  const queries = makeCell(ctx, options, server, (cache) => {
    cache.onFetch((event) => {
      if (!frozen) recording.tree({ _tag: "FetchStarted", ...event })
    })
    if (server !== undefined) cache.onFetchEnd(checkIdle)
    const shipped = state?.["~query"]
    if (shipped !== undefined) {
      cache.hydrate(shipped, { static: fromStatic, at: hydratedAt })
      if (windowClosed) cache.closeWindow()
    }
  })
  if (state?.["~query"] !== undefined) queries.cache()
  let kernelRoot: Kernel.Root | undefined
  kernelRoot = recording.session(() =>
    Kernel.mount(
      component as unknown as Kernel.Runnable,
      props,
      container,
      bridged,
      {
        context: Context.add(
          Context.add(ctx, queryCore.CacheKey, queries.cell as never),
          services.CurrentRoot,
          () => routing?.handle
        ),
        init: (inst) => {
          const made = inst.component as unknown as Component.Any
          const elements = made.elements()
          if (
            elements !== undefined && host.elements !== "any" &&
            !host.elements.includes(elements.name)
          ) {
            throw new Error(
              `${made.definition.name} renders ${elements.name} elements, and this host shows ${
                host.elements.join(", ")
              }`
            )
          }
          const first = inst.component.init(inst.props)
          const adopted = hydration?.init(inst, first)
          if (adopted !== undefined) {
            return routing === undefined
              ? adopted
              : routing.init(inst, adopted, true)
          }
          if (server !== undefined && first.commands.length > 0) {
            initCommands = first.commands
            return {
              model: first.model,
              commands: noCommands,
              events: first.events,
              lists: first.lists,
              sends: first.sends,
              viewTransition: first.viewTransition
            }
          }
          return routing === undefined ? first : routing.init(inst, first)
        },
        log: record,
        schedule: (task) => {
          const run = recording.follow()
          executor.schedule(() => {
            flushes++
            inFlush = true
            try {
              run(task)
            } finally {
              inFlush = false
            }
          })
        },
        follow: recording.follow,
        report: (path, where, cause) => {
          Effect.runForkWith(ctx)(
            Effect.logError(`${path} failed in ${where}`, cause)
          )
        },
        fallback: fallback === undefined ?
          undefined :
          (cause) =>
            View.toNode(
              fallback(
                AsyncResult.failure(cause),
                View.makeHelper({}, component.elements())
              )
            )
      }
    )
  )
  inFlush = false
  firstHeld = hydration?.held().length ?? 0
  hydration?.end()
  const mounted = kernelRoot
  const instance = mounted.instance
  const tree = instance.tree
  if (routing !== undefined) {
    routing.attach(instance)
    routed.add(tree)
    routing.flushed()
  }
  tree.flush = () => inFlush ? flushes : flushes + 1
  const root = {
    path: instance.path,
    session,
    instance: instance as unknown as Instance,
    emitted,
    model: () => instance.failure === undefined ? instance.model : undefined,
    send: (message: unknown) =>
      recording.step(() => mounted.send(message, dispatched)),
    pending: () => pendingOf(instance),
    loads: () => [],
    get cache() {
      return (queries.cache() ?? { pending: () => [] }) as unknown as Root[
        "cache"
      ]
    },
    crashed: () => instance.failure,
    flush: () => flushes,
    buildsPendingSince: building,
    head: () =>
      tree.head?.value ??
        (component.elements()?.head ?? neutralFold).merge({
          entries: [],
          children: []
        }),
    adoptionHead: () => adoptedDone ? adoptionHead : undefined,
    adopted: Effect.callback<void>((resume) => {
      if (adoptedDone) resume(Effect.void)
      else adoptedWaiters.push(() => resume(Effect.void))
    }),
    waiting: () => {
      const out: Array<string> = []
      for (const inst of waiting.keys()) if (!inst.closed) out.push(inst.path)
      return hydration === undefined ? out : out.concat(hydration.held())
    },
    whenIdle: (f: () => void) => {
      idleWaiters.push(f)
      checkIdle()
    },
    freeze: () => {
      if (!frozen) {
        tree.transitions?.settle()
        if (!tree.closed && (tree.scheduled || tree.dirty.length > 0)) {
          Kernel.flush(tree)
        }
        frozen = tree.closed = true
      }
      return queries.made()
    }
  } satisfies Root & Renderer.Root<any, any>
  if (firstHeld === 0) adoptionHead = root.head()
  started = true
  checkAdopted()
  // Waits until every fiber the tree forked has exited, stopped runs included.
  const awaitOwned: Effect.Effect<void> = Effect.suspend(() =>
    tree.owned === undefined || tree.owned.size === 0
      ? Effect.void
      : Effect.andThen(Fiber.awaitAll([...tree.owned]), awaitOwned)
  )
  return {
    root,
    deferred,
    close: Effect.suspend(() => {
      routing?.detach()
      dom?.dispose()
      if (frozen) tree.closed = false
      mounted.close()
      return Effect.andThen(awaitOwned, queries.dispose)
    })
  }
}

type Pending = ReturnType<Root["pending"]>[number]

/** The runs of `inst` and of the instances it shows, parents first. */
const pendingOf = (
  inst: Kernel.Instance,
  out: Array<Pending> = []
): Array<Pending> => {
  const runs = inst.runs
  if (runs !== undefined) {
    for (const run of runs.pending()) {
      out.push({ path: inst.path, ...run } as Pending)
    }
  }
  if (inst.rendered !== undefined) pendingIn(inst.rendered, out)
  return out
}

const pendingIn = (rec: Kernel.Rec, out: Array<Pending>): void => {
  const kids = rec.kids
  if (kids !== undefined) { for (const kid of kids) pendingIn(kid, out) }
  else if (rec.v._tag === "Child" && !rec.inst.closed) pendingOf(rec.inst, out)
}

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

/**
 * Renders a tree on the server: on a host that only keeps the node tree, waiting for provided Layers
 * and the per-request cache's fetches until nothing is in flight or the budget runs out, then writing
 * it once.
 *
 * Only the kernel test project calls it, through its alias for `internal/runtime.ts`.
 *
 * @internal
 */
// oxlint-disable-next-line effect/no-unused-internal
export const prerender = (
  component: Component.Any,
  rootProps: unknown,
  options: {
    readonly budget: Duration.Input
    readonly elements: ReadonlyArray<string> | "any"
    readonly static?: boolean | undefined
    readonly sink?: services.ServerSink | undefined
    readonly onFinish?: ((cache: queryCore.Cache) => void) | undefined
  }
): Effect.Effect<Renderer.Prerendered<any>> =>
  withProps(rootProps, (props) =>
    Effect.acquireUseRelease(
      Scope.make("sequential"),
      Effect.fnUntraced(function*(scope) {
        const budget = Duration.fromInputUnsafe(options.budget)
        const started = !Duration.isZero(budget)
        const host = serverHost.make(options.elements)
        const ctx = Context.add(
          yield* Effect.context<never>(),
          Scope.Scope,
          scope
        )
        const made = start(
          component,
          props,
          host.createElement("#root"),
          ctx,
          undefined,
          { host, fetches: started }
        )
        yield* Scope.addFinalizer(scope, made.close)
        const root = made.root
        if (started) {
          yield* Effect.raceFirst(
            Effect.callback<void>((resume) => {
              root.whenIdle(() => resume(Effect.void))
            }),
            Effect.sleep(budget)
          )
        }
        const cache = root.freeze()
        const snap = serialize.snapshot(
          root.instance as unknown as Kernel.Instance,
          made.deferred
        )
        if (cache !== undefined) options.onFinish?.(cache)
        const query = cache === undefined ? {} : cache.dehydrate()
        const nodes: Array<Renderer.ServerNode> = []
        const state = yield* serialize.write(
          snap,
          query,
          ctx,
          options.static === true,
          options.sink ?? serialize.nodeSink(nodes)
        )
        return { nodes, state, model: root.model(), head: root.head() }
      }),
      (scope, exit) => Scope.close(scope, exit)
    ))
