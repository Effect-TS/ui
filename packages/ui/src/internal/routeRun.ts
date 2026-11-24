import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as SchemaIssue from "effect/SchemaIssue"
import type * as Component from "../Component.ts"
import type * as View from "../View.ts"
import { runCodec, warnOnce, warnUnencoded } from "./codecRun.ts"
import { routed } from "./due.ts"
import type * as keptRun from "./keptRun.ts"
import * as Kernel from "./kernel.ts"
import { segmentOf } from "./paths.ts"
import type * as prefetchWalk from "./prefetch.ts"
import type * as componentQueries from "./queries.ts"
import * as queryCore from "./queryCore.ts"
import type * as services from "./services.ts"
import {
  type Decoded,
  encodePage,
  reportedOf,
  stateCodecOf
} from "./stateCodec.ts"

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

interface Held {
  readonly owner: Kernel.Instance
  readonly rec: Kernel.Rec
  readonly path: string
  readonly saved: Saved
  readonly notes: Saved | undefined
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

/** @internal */
export const make = (hooks: services.RootHooks, root: Root): Routed => {
  const ctx = root.context
  const report = Context.get(ctx, queryCore.Problems)
  const restored = new WeakSet<Kernel.Instance>()
  let instance: Kernel.Instance | undefined
  let detach: (() => void) | undefined
  const write = (
    inst: Kernel.Instance,
    out: Saved,
    exit: Exit.Exit<services.PageState, SchemaIssue.Issue>
  ) => {
    if (Exit.isSuccess(exit)) {
      out[inst.path] = exit.value.state
      if (exit.value.reported !== undefined) {
        ;((out["~reported"] ??= {}) as Saved)[inst.path] = exit.value.reported
      }
      return
    }
    warnUnencoded(inst, ctx, exit.cause)
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
      encodePage(component, model, inst.results, inst.owning)
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
  const keptIn = (out: Saved, top: Saved, author: string): Saved =>
    (((out[out === top ? "~kept" + root.path : "~kept"] ??= {}) as Saved)[
      author
    ] ??= {}) as Saved
  const visit = (inst: Kernel.Instance, out: Saved, top: Saved) => {
    queryCore.loaded?.run.drain(inst)
    if (inst.closed || inst.failure !== undefined) return
    save(inst, out)
    if (inst.env.ctx === undefined && inst.env.cause === undefined) return
    for (const held of waitingFor.values()) {
      if (held.owner === inst) keepHeld(held, out, top)
    }
    for (const child of childrenOf(inst.rendered)) {
      if ((child.at!.v as View.Child<any, any>).alive === undefined) {
        visit(child, out, top)
      }
    }
    const table = inst.kept as keptRun.Table | undefined
    const unclaimed = waits.get(inst)
    if (table === undefined && unclaimed === undefined) return
    const notes = keptIn(out, top, inst.path)
    for (const path in unclaimed) notes[path] = unclaimed[path]
    if (table === undefined) return
    for (const entry of table.kids.values()) {
      visit(entry.inst, notes[entry.inst.path] = {}, top)
    }
  }
  let popped: Saved | undefined
  const pop = () => {
    const left = hooks.entry()
    popped = left && { ...left["~kept" + root.path] as Saved | undefined }
  }
  const waits = new WeakMap<Kernel.Instance, Saved>()
  const supplies = new WeakMap<Kernel.Instance, Saved>()
  const claim = (inst: Kernel.Instance, from: Saved | undefined) => {
    const notes = from?.[inst.path] as Saved | undefined
    if (notes === undefined) return
    delete from![inst.path]
    waits.set(inst, { ...notes })
  }
  const supplyOf = (inst: Kernel.Instance): Saved | undefined => {
    if ((inst.at?.v as View.Child<any, any> | undefined)?.alive !== undefined) {
      const author = waits.get(inst.parent!)
      const own = author?.[inst.path] as Saved | undefined
      if (own !== undefined) {
        delete author![inst.path]
        supplies.set(inst, own)
        return own
      }
    }
    for (let at = inst.parent; at !== undefined; at = at.parent) {
      const own = supplies.get(at)
      if (own !== undefined) return own
    }
    return undefined
  }
  const waitingFor = new Map<Kernel.Rec, Held>()
  const keepHeld = (held: Held, out: Saved, top: Saved) => {
    const { path, saved } = held
    const view = held.rec.v as View.Child<any, any>
    const to = view.alive === undefined
      ? out
      : (keptIn(out, top, held.owner.path)[path] = {}) as Saved
    const reported = saved["~reported"] as Saved | undefined
    for (const key in saved) {
      if (key === path || key[0] === "~") continue
      to[key] = saved[key]
      if (reported?.[key] !== undefined) {
        ;((to["~reported"] ??= {}) as Saved)[key] = reported[key]
      }
    }
    for (const author in held.notes) {
      Object.assign(keptIn(to, top, author), held.notes[author])
    }
    const component = view.component as unknown as Component.Any
    const restore = component.definition.restore
    const state = saved[path]
    if (state === undefined || restore === false) return
    const found = { state, reported: reported?.[path] }
    const inst = { path, component } as unknown as Kernel.Instance
    if (restore === undefined) return write(inst, to, Exit.succeed(found))
    const codec = stateCodecOf(component)
    const encoded = runCodec(
      Effect.flatMapEager(codec.decode(state), (decoded) =>
        Effect.mapEager(
          codec.encode(restore(decoded.model, view.props), decoded.results),
          (state) => ({ state, reported: found.reported })
        ))
    )
    if (Exit.isExit(encoded)) return write(inst, to, encoded as never)
    encoded.addObserver((exit) => write(inst, to, exit as never))
  }
  const heldFor: Routed["heldFor"] = (owner, rec, path, found) => {
    waitingFor.set(rec, {
      owner,
      rec,
      path,
      saved: { [path]: found.state, "~reported": { [path]: found.reported } },
      notes: undefined
    })
    return () => waitingFor.delete(rec)
  }
  const taken = new Map<
    string,
    readonly [services.PageState, Exit.Exit<Decoded, unknown>]
  >()
  const hold: Routed["hold"] = (owner, rec, at) => {
    const view = rec.v as View.Child<any, any>
    const component = view.component as unknown as Component.Any
    if (component.definition?.restore === false) return false
    const path = (view.alive === undefined && at || owner.path) + "/" +
      segmentOf(view.component, view.key)
    let own: Saved | undefined
    if (view.alive !== undefined) own = waits.get(owner)?.[path] as Saved
    for (
      let up: Kernel.Instance | undefined = owner;
      !own && up;
      up = up.parent
    ) {
      own = supplies.get(up)
    }
    const found = own === undefined
      ? hooks.restore(path)
      : own[path] === undefined
      ? undefined
      : { state: own[path], reported: (own["~reported"] as Saved)?.[path] }
    if (found === undefined) return false
    const decoded = runCodec(stateCodecOf(component).decode(found.state))
    if (Exit.isExit(decoded)) {
      taken.set(path, [found, decoded])
      return false
    }
    const entry = own ?? hooks.entry() as Saved | undefined
    const saved: Saved = { [path]: found.state }
    for (const key in entry) {
      if (key.startsWith(path + "/")) saved[key] = entry[key]
    }
    saved["~reported"] = {
      ...entry?.["~reported"] as Saved | undefined,
      [path]: found.reported
    }
    const kept = own === undefined ? popped : own["~kept"] as Saved | undefined
    const notes: Saved = {}
    for (const author in kept) {
      if (author === path || author.startsWith(path + "/")) {
        notes[author] = kept[author]
      }
    }
    waitingFor.set(rec, { owner, rec, path, saved, notes })
    decoded.addObserver((exit) => {
      const tree = owner.tree
      tree.schedule(() => {
        waitingFor.delete(rec)
        taken.set(path, [found, exit])
        Kernel.settle(owner, rec, at)
        taken.delete(path)
        Kernel.flush(tree)
      })
    })
    return true
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
    get hydrated() {
      return root.hydrated?.() ?? false
    },
    static: root.static ?? false,
    path: root.path,
    container: root.container,
    flush: root.flush,
    since: root.since,
    snapshot: (out) => {
      if (instance !== undefined) visit(instance, out, out)
    },
    navigated: () => {
      root.navigated?.()
      pop()
    },
    restored: () => {
      popped = undefined
    },
    report,
    declare: declare as never
  }
  pop()
  return {
    handle,
    init: (inst, first, adopted) => {
      const view = viewOf(inst)
      if (recording > 0) {
        view.watched = new Set()
        recorded.add(view)
      }
      const component = inst.component as unknown as Component.Any
      const own = supplyOf(inst)
      claim(inst, own === undefined ? popped : own["~kept"] as Saved)
      if (adopted === true || component.definition.restore === false) {
        return first
      }
      const held = taken.get(inst.path)
      taken.delete(inst.path)
      const found: services.PageState | undefined = held !== undefined
        ? held[0]
        : own === undefined
        ? hooks.restore(inst.path)
        : own[inst.path] === undefined
        ? undefined
        : {
          state: own[inst.path],
          reported: (own["~reported"] as Saved | undefined)?.[inst.path]
        }
      if (found === undefined) return first
      const exit = held?.[1] ?? Effect.runSyncExit(
        stateCodecOf(component).decode(found.state)
      )
      if (Exit.isFailure(exit)) return first
      restored.add(inst)
      inst.results = restoreQueries(inst, exit.value.results)
      inst.owning = reportedOf(component, found.reported, false)
      return {
        model: exit.value.model,
        commands: first.commands,
        events: [],
        lists: first.lists,
        sends: first.sends
      }
    },
    restored: (inst) => restored.has(inst),
    hold,
    heldFor,
    attach: (inst) => {
      instance = inst
      routed.add(inst.tree)
      inst.tree.watched = (at, query, argsKey) =>
        views.get(at)?.watched?.add(entryKey(query, argsKey))
      const ended = inst.tree.ended
      inst.tree.ended = (author, path) => {
        ended?.(author, path)
        delete waits.get(author)?.[path]
      }
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
