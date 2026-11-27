import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import type * as Component from "../Component.ts"
import { warnOnce, warnUnencoded } from "./codecRun.ts"
import { routed } from "./due.ts"
import type * as Kernel from "./kernel.ts"
import type * as prefetchWalk from "./prefetch.ts"
import * as queryCore from "./queryCore.ts"
import type * as services from "./services.ts"
import * as stateRestore from "./stateRestore.ts"

/** @internal */
export interface Root {
  readonly path: string
  readonly container: unknown
  readonly context: Context.Context<any>
  readonly flush: () => number
  readonly since: () => number
  readonly buildsPendingSince: (flush: number) => number
  readonly hydrated?: (() => boolean) | undefined
  readonly static?: boolean | undefined
  readonly navigated?: (() => void) | undefined
}

/** @internal */
export interface Routed {
  readonly handle: services.RootHandle
  readonly init: (
    inst: Kernel.Instance,
    first: Kernel.Next,
    adopted?: boolean
  ) => Kernel.Next
  readonly restored: (inst: Kernel.Instance) => boolean
  readonly hold: NonNullable<Kernel.Host["hold"]>
  readonly heldFor: (
    owner: Kernel.Instance,
    rec: Kernel.Rec,
    path: string,
    found: services.PageState
  ) => () => void
  readonly attach: (instance: Kernel.Instance) => void
  readonly flushed: () => void
  readonly detach: () => void
}

interface Walked extends prefetchWalk.Instance {
  watched: Set<string> | undefined
}

interface Declared {
  declaration: services.Prefetch
  release: (() => void) | undefined
}

const entryKey = (query: string, argsKey: string): string =>
  `${query}\u0000${argsKey}`

/** @internal */
export const make = (hooks: services.RootHooks, root: Root): Routed => {
  const ctx = root.context
  const report = Context.get(ctx, queryCore.Problems)
  let instance: Kernel.Instance | undefined
  let detach: (() => void) | undefined
  const state = stateRestore.make({
    rootPath: root.path,
    entry: hooks.entry,
    restore: hooks.restore,
    onEncodeFailure: (inst, cause) => warnUnencoded(inst, ctx, cause),
    onAsyncEncode: (inst) => {
      warnOnce(
        "late",
        inst,
        ctx,
        () =>
          "its state encodes asynchronously, so history keeps it in memory only. Back and forward restore it, and " +
          "after a reload it starts from init."
      )
      return true
    },
    onRestoreThrow: (inst, error) =>
      warnOnce(
        "restore",
        inst,
        ctx,
        () =>
          "its restore threw, so history doesn't restore it. " +
          Cause.pretty(Cause.die(error))
      )
  })
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
          return stateRestore.childrenOf(inst.rendered).map(viewOf)
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
      report: (problem) => queryCore.report(ctx, problem),
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
    const current = declared.get(inst)
    if (declaration === undefined) {
      if (current === undefined) return
      declared.delete(inst)
      return current.release?.()
    }
    if (current !== undefined) {
      current.declaration = declaration
      return
    }
    const added: Declared = { declaration, release: undefined }
    declared.set(inst, added)
    added.release = hooks.prefetch(runtime(), viewOf(inst), added)
    ;(inst.closers ??= []).push(() => declare(inst, undefined))
  }
  const handle: services.RootHandle = {
    get hydrated() {
      return root.hydrated?.() ?? false
    },
    static: root.static ?? false,
    path: root.path,
    container: root.container,
    flush: root.flush,
    since: root.since,
    snapshot: (out) => {
      if (instance !== undefined) state.snapshot(instance, out)
    },
    navigated: () => {
      root.navigated?.()
      state.pop()
    },
    restored: () => {
      state.clear()
    },
    still: () => {
      instance?.tree.transitions?.still()
    },
    report,
    declare: declare as never
  }
  return {
    handle,
    init: (inst, first, adopted) => {
      const view = viewOf(inst)
      if (recording > 0) {
        view.watched = new Set()
        recorded.add(view)
      }
      return state.init(inst, first, adopted)
    },
    restored: state.restored,
    hold: state.hold,
    heldFor: state.heldFor,
    attach: (inst) => {
      instance = inst
      routed.add(inst.tree)
      inst.tree.watched = (at, query, argsKey) =>
        views.get(at)?.watched?.add(entryKey(query, argsKey))
      state.watch(inst.tree)
      detach = hooks.attach(handle)
    },
    flushed: () => {
      if (instance === undefined) return
      hooks.afterFlush(handle, {
        flush: root.flush(),
        title: instance.tree.head?.title,
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
