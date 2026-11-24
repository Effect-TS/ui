/**
 * The Router's side of a kernel root: the handle the Router attaches, the state history restore gives a new
 * instance, and the snapshot of every instance's state. `Router` hands it over with its hooks, so neither
 * the kernel nor an app without a Router carries it.
 *
 * @internal
 */
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as SchemaIssue from "effect/SchemaIssue"
import type * as Component from "../Component.ts"
import type * as Kernel from "./kernel.ts"
import type * as prefetchWalk from "./prefetch.ts"
import type * as componentQueries from "./queries.ts"
import * as queryCore from "./queryCore.ts"
import type * as services from "./services.ts"
import { redactedIssue, stateCodecOf } from "./stateCodec.ts"

/**
 * What the runtime tells it of the root it serves.
 *
 * @internal
 */
export interface Root {
  readonly path: string
  readonly container: unknown
  readonly context: Context.Context<any>
  readonly flush: () => number
  readonly flushing: () => boolean
  readonly buildsPendingSince: (flush: number) => number
}

/**
 * A root's part in history restore and navigation.
 *
 * @internal
 */
export interface Routed {
  readonly handle: services.RootHandle
  /** What a new instance starts from: `first`, or the Model history saved for its path, with `init`'s Commands. */
  readonly init: (inst: Kernel.Instance, first: Kernel.Next) => Kernel.Next
  /** Whether the instance started from what history saved. */
  readonly restored: (inst: Kernel.Instance) => boolean
  /** Attaches the root to the Router, once it has rendered. */
  readonly attach: (instance: Kernel.Instance) => void
  /** Tells the Router a flush committed. */
  readonly flushed: () => void
  readonly detach: () => void
}

type Saved = Record<string, unknown>

interface Walked extends prefetchWalk.Instance {
  watched: Set<string> | undefined
}

interface Declared {
  declaration: services.Prefetch
  release: (() => void) | undefined
}

const entryKey = (query: string, argsKey: string): string =>
  `${query}\u0000${argsKey}`

const childrenOf = (
  rec: Kernel.Rec | undefined,
  out: Array<Kernel.Instance> = []
): Array<Kernel.Instance> => {
  if (rec === undefined) return out
  const kids = rec.kids
  if (kids !== undefined) { for (const kid of kids) childrenOf(kid, out) }
  else if (rec.v._tag === "Child" && !rec.inst.closed) out.push(rec.inst)
  return out
}

const warned = new WeakMap<object, Set<string>>()

const warnOnce = (
  kind: string,
  inst: Kernel.Instance,
  ctx: Context.Context<any>,
  message: () => string
): void => {
  const component = inst.component as unknown as Component.Any
  let kinds = warned.get(component)
  if (kinds === undefined) warned.set(component, kinds = new Set())
  if (kinds.has(kind)) return
  kinds.add(kind)
  Effect.runForkWith(ctx)(
    Effect.logWarning(`${component.definition.name}: ${message()}`)
  )
}

const formatIssue = SchemaIssue.makeFormatterDefault()

const runCodec = <A, E>(
  effect: Effect.Effect<A, E>
): Exit.Exit<A, E> | Fiber.Fiber<A, E> => {
  const exit = Effect.runSyncExit(effect)
  if (Exit.isFailure(exit)) {
    const defect = Cause.findDefect(exit.cause)
    if (Result.isSuccess(defect) && Cause.isAsyncFiberError(defect.success)) {
      return defect.success.fiber as Fiber.Fiber<A, E>
    }
  }
  return exit
}

const restoreQueries = (
  inst: Kernel.Instance,
  results: componentQueries.Results | undefined
): componentQueries.Results | undefined => {
  const bound = queryCore.boundOf(inst.component as unknown as Component.Any)
  if (bound === undefined || results === undefined) return results
  const loaded = queryCore.loaded!
  const cache = loaded.run.cacheOf(inst)
  const out: Record<string, unknown> = {}
  for (const entry of bound.entries) {
    const snapshot = results[entry.name]
    if (entry.keyed) {
      const map = loaded.snapshotMapData(snapshot)
      const kept: Array<unknown> = []
      for (const one of map?.entries.values() ?? []) {
        if (loaded.snapshotData(one)!.patched) continue
        cache.seed(one as never)
        kept.push(one)
      }
      out[entry.name] = map !== undefined && kept.length === map.entries.size
        ? snapshot
        : bound.snapshotMany(entry, kept as never)
      continue
    }
    const data = loaded.snapshotData(snapshot)
    if (data !== undefined && !data.patched) {
      cache.seed(snapshot as never)
      out[entry.name] = snapshot
    } else out[entry.name] = bound.empty[entry.name]
  }
  return out
}

/**
 * The root's handle and hooks for the Router whose `hooks` its context holds.
 *
 * @internal
 */
export const make = (hooks: services.RootHooks, root: Root): Routed => {
  const ctx = root.context
  const report = Context.get(ctx, queryCore.Problems)
  const restored = new WeakSet<Kernel.Instance>()
  let instance: Kernel.Instance | undefined
  let detach: (() => void) | undefined
  const write = (
    inst: Kernel.Instance,
    out: Saved,
    exit: Exit.Exit<unknown, SchemaIssue.Issue>
  ) => {
    if (Exit.isSuccess(exit)) {
      out[inst.path] = exit.value
      return
    }
    const error = Cause.findErrorOption(exit.cause)
    if (Option.isSome(error) && error.value === redactedIssue) return
    warnOnce(
      "unencoded",
      inst,
      ctx,
      () =>
        "its state doesn't encode as JSON, so the server sends no state for it and the client builds it and " +
        "everything under it fresh, without hydration, and history doesn't restore it. " +
        Option.match(error, {
          onNone: () => Cause.pretty(exit.cause),
          onSome: formatIssue
        })
    )
  }
  const save = (inst: Kernel.Instance, out: Saved) => {
    const component = inst.component as unknown as Component.Any
    const restore = component.definition.restore
    if (restore === false) return
    let model = inst.model
    if (restore !== undefined) {
      try {
        model = restore(inst.model, inst.props)
      } catch (error) {
        return warnOnce(
          "restore",
          inst,
          ctx,
          () =>
            "its restore threw, so history doesn't restore it. " +
            Cause.pretty(Cause.die(error))
        )
      }
    }
    const encoded = runCodec(
      stateCodecOf(component).encode(
        model,
        inst.results as componentQueries.Results | undefined
      )
    )
    if (Exit.isExit(encoded)) return write(inst, out, encoded)
    warnOnce(
      "late",
      inst,
      ctx,
      () =>
        "its state encodes asynchronously, so history keeps it in memory only. Back and forward restore it, and " +
        "after a reload it starts from init."
    )
    encoded.addObserver((exit) => write(inst, out, exit))
  }
  const visit = (inst: Kernel.Instance, out: Saved) => {
    queryCore.loaded?.run.drain(inst)
    if (inst.closed || inst.failure !== undefined) return
    save(inst, out)
    for (const child of childrenOf(inst.rendered)) visit(child, out)
  }
  let made = 0
  let recording = 0
  const recorded = new Set<Walked>()
  const views = new WeakMap<Kernel.Instance, Walked>()
  const viewOf = (inst: Kernel.Instance): Walked => {
    let view = views.get(inst)
    if (view === undefined) {
      view = {
        path: inst.path,
        get closed() {
          return inst.closed
        },
        get failure() {
          return inst.failure
        },
        get parent() {
          return inst.parent === undefined ? undefined : viewOf(inst.parent)
        },
        get env() {
          return inst.env
        },
        component: inst.component as unknown as Component.Any,
        get children() {
          return childrenOf(inst.rendered).map(viewOf)
        },
        born: ++made,
        shares: undefined,
        watched: undefined
      }
      views.set(inst, view)
    }
    return view
  }
  let walk: prefetchWalk.Runtime | undefined
  const runtime = (): prefetchWalk.Runtime =>
    walk ??= {
      now: () => Context.get(ctx, Clock.Clock).currentTimeMillisUnsafe(),
      report: (problem) => {
        try {
          report(problem as never)
        } catch {
          // A sink can't change what the runtime does.
        }
      },
      cache: () => queryCore.loaded!.run.cacheOf(instance!),
      entryKey,
      root: () => viewOf(instance!),
      since: () => ({ born: made, build: instance?.tree.builds ?? 0 }),
      lastFailedBuild: () => instance?.tree.failedBuild ?? 0,
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
  const declared = new WeakMap<Kernel.Instance, Declared>()
  const declare = (
    inst: Kernel.Instance,
    declaration: services.Prefetch | undefined
  ) => {
    const state = declared.get(inst)
    if (declaration === undefined) {
      if (state === undefined) return
      declared.delete(inst)
      return state.release?.()
    }
    if (state !== undefined) {
      state.declaration = declaration
      return
    }
    const added: Declared = { declaration, release: undefined }
    declared.set(inst, added)
    added.release = hooks.prefetch(runtime(), viewOf(inst), added)
    ;(inst.closers ??= []).push(() => declare(inst, undefined))
  }
  const handle: services.RootHandle = {
    hydrated: false,
    static: false,
    path: root.path,
    container: root.container,
    flush: root.flush,
    flushing: root.flushing,
    snapshot: (out) => {
      if (instance !== undefined) visit(instance, out)
    },
    navigated: () => {},
    restored: () => {},
    report,
    declare: declare as never
  }
  return {
    handle,
    init: (inst, first) => {
      const view = viewOf(inst)
      if (recording > 0) {
        view.watched = new Set()
        recorded.add(view)
      }
      const component = inst.component as unknown as Component.Any
      if (component.definition.restore === false) return first
      const found = hooks.restore(inst.path)
      if (found === undefined) return first
      const exit = Effect.runSyncExit(
        stateCodecOf(component).decode(found.state)
      )
      if (Exit.isFailure(exit)) return first
      restored.add(inst)
      inst.results = restoreQueries(inst, exit.value.results)
      return {
        model: exit.value.model,
        commands: first.commands,
        events: [],
        lists: first.lists,
        sends: first.sends
      }
    },
    restored: (inst) => restored.has(inst),
    attach: (inst) => {
      instance = inst
      inst.tree.watched = (at, query, argsKey) =>
        views.get(at)?.watched?.add(entryKey(query, argsKey))
      detach = hooks.attach(handle)
    },
    flushed: () => {
      if (instance === undefined) return
      hooks.afterFlush(handle, {
        flush: root.flush(),
        title: undefined,
        buildsPendingSince: root.buildsPendingSince
      })
    },
    detach: () => {
      instance = undefined
      detach?.()
      detach = undefined
    }
  }
}
