/** @internal */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Fiber from "effect/Fiber"
import * as Result from "effect/Result"
import type * as Component from "../Component.ts"
import type * as Renderer from "../Renderer.ts"
import type * as View from "../View.ts"
import * as Kernel from "./kernel.ts"
import { segmentOf } from "./paths.ts"
import { restored } from "./sharedRun.ts"
import { type Decoded, reportedOf, stateCodecOf } from "./stateCodec.ts"

/** @internal */
export interface Adopting<N = any> {
  readonly host: Kernel.Host<N>
  readonly hold: (path: string) => void
  /** A child starts at `path`: `served` when the server's state has it. */
  readonly child: (path: string, served: boolean) => void
  /** Whether the server drew the kept child at `path` here. */
  readonly has: (path: string) => boolean
  readonly done: () => void
}

/** @internal */
export interface Adoption<N = any> {
  readonly root: Adopting<N> | undefined
  readonly resume: (placeholder: N) => Adopting<N> | undefined
  /** Given the nodes an instance adopted before its Layer was ready, as their events go live. */
  readonly live?:
    | ((nodes: ReadonlyArray<readonly [N, Kernel.Rec]>) => void)
    | undefined
}

/** @internal */
export type Adopt<N = any> = (
  base: Kernel.Host<N>,
  container: N,
  path: string
) => Adoption<N>

/** @internal */
export interface Hydration {
  readonly init: (
    inst: Kernel.Instance,
    first: Kernel.Next
  ) => Kernel.Next | undefined
  readonly adopts: (inst: Kernel.Instance) => boolean
  /** Whether it's in a kept child off the page: adoption doesn't wait for it. */
  readonly parked: (inst: Kernel.Instance) => boolean
  readonly held: () => ReadonlyArray<string>
  readonly end: () => void
  readonly settled: () => boolean
}

const methods = [
  "createElement",
  "createText",
  "setAttr",
  "setProp",
  "made",
  "insert"
] as const

const use = (target: Kernel.Host, from: Kernel.Host): void => {
  for (const name of methods) (target as any)[name] = from[name]
}

const decode = (
  component: Kernel.Runnable,
  encoded: unknown
): Exit.Exit<Decoded, unknown> | Fiber.Fiber<Decoded, unknown> => {
  const exit = Effect.runSyncExit(
    stateCodecOf(component as unknown as Component.Any).decode(encoded)
  )
  if (Exit.isFailure(exit)) {
    const defect = Cause.findDefect(exit.cause)
    if (Result.isSuccess(defect) && Cause.isAsyncFiberError(defect.success)) {
      return defect.success.fiber as Fiber.Fiber<Decoded, unknown>
    }
  }
  return exit
}

/**
 * The decode of the root's state from the server, which the mount waits for when it's asynchronous, as
 * the root holds the server's nodes until it adopts with it.
 *
 * @internal
 */
export const decodeRoot = (
  component: Kernel.Runnable,
  state: Renderer.State,
  path: string
): Exit.Exit<Decoded, unknown> | Fiber.Fiber<Decoded, unknown> | undefined =>
  state["~deferred"]?.includes(path) === true || !Object.hasOwn(state, path)
    ? undefined
    : decode(component, state[path])

const noEvents: ReadonlyArray<unknown> = []

type Saved = Record<string, any>

/** @internal */
export const make = (
  state: Renderer.State,
  host: Kernel.Host,
  base: Kernel.Host,
  adoption: Adoption | undefined,
  settled: () => void,
  root?: readonly [string, Exit.Exit<Decoded, unknown>],
  waits?: (
    owner: Kernel.Instance,
    rec: Kernel.Rec,
    path: string,
    found: { readonly state: unknown; readonly reported: unknown }
  ) => () => void
): Hydration => {
  const deferred = new Set(state["~deferred"])
  const adopting = new WeakSet<Kernel.Instance>()
  const decoded = new Map<string, Decoded | undefined>()
  if (root !== undefined) {
    decoded.set(root[0], Exit.isSuccess(root[1]) ? root[1].value : undefined)
  }
  const resumed = new WeakSet<Kernel.Rec>()
  // The instances that adopt the server's nodes, by path, as receivers of the slots kept children are
  // drawn in.
  const started = new Map<string, Kernel.Instance>()
  const held = new Map<Kernel.Rec, string>()
  // How each held child stops waiting once it's no longer drawn, by its owner.
  const drops = new Map<Kernel.Rec, readonly [Kernel.Instance, () => void]>()
  // Owners that adopted what their reports sent on the server, compared once nothing below waits to adopt.
  const owners: Array<Kernel.Instance> = []
  // The state each instance that started from the server's without its nodes gives its children: a kept
  // child the client writes after the pass, or in its notes, and what's under it. Each kept path once.
  const supplies = new WeakMap<Kernel.Instance, Saved>()
  const claimed = new Set<string>()
  const parked = new Set<Kernel.Instance>()
  // What each child that starts from a supply was given, by path, from its hold to its init.
  const given = new Map<string, Saved>()
  const supplyOf = (
    parent: Kernel.Instance,
    path: string,
    kept: boolean
  ): Saved | undefined => {
    const from = supplies.get(parent)
    if (!kept) return from
    if (claimed.has(path)) return undefined
    claimed.add(path)
    const base = from ?? (adopting.has(parent) ? state as Saved : undefined)
    const byChild = base?.["~kept"]?.[parent.path]
    const notes = byChild?.[path]
    if (notes !== undefined) return notes
    return base === state && deferred.has(path) ? undefined : base
  }
  let hooked = false
  let active = adoption?.root
  let pass = true
  let resuming = false
  const serves = (owner: Kernel.Instance | undefined, path: string) =>
    (owner === undefined ? pass : adopting.has(owner) && (pass || resuming)) &&
    !deferred.has(path) &&
    Object.hasOwn(state, path)
  if (active !== undefined) use(host, active.host)
  const setEvents = host.setEvents
  const inert = new WeakMap<
    Kernel.Env,
    Map<unknown, [Kernel.Rec, boolean | undefined]>
  >()
  ;(host as { setEvents: Kernel.Host["setEvents"] }).setEvents = (
    node,
    rec,
    first
  ) => {
    const env = rec.inst.env
    if (
      !adopting.has(rec.inst) || env.ctx !== undefined ||
      env.cause !== undefined
    ) return setEvents(node, rec, first)
    let queued = inert.get(env)
    if (queued === undefined) {
      const wanted = queued = new Map()
      inert.set(env, wanted)
      env.waiting.push(() => {
        inert.delete(env)
        const live: Array<readonly [unknown, Kernel.Rec]> = []
        for (const [node, [rec, first]] of wanted) {
          if (rec.inst.closed) continue
          setEvents(node, rec, first)
          live.push([node, rec])
        }
        adoption?.live?.(live)
      })
    }
    queued.set(node, [rec, queued.get(node)?.[1] ?? first])
  }
  const finish = () => {
    if (pass || held.size > 0) return
    for (const owner of owners.splice(0)) restored(owner)
    started.clear()
    settled()
  }
  // A child the server's state doesn't have is held as history restore holds it.
  const fallback = host.hold
  ;(host as { hold: Kernel.Host["hold"] }).hold = (owner, rec, at) => {
    const view = rec.v as View.Child<any, any>
    // A kept child's path is under its author's, wherever it's drawn.
    const path = (view.alive === undefined && at || owner.path) + "/" +
      segmentOf(view.component, view.key)
    if (resumed.delete(rec)) return false
    const served = serves(owner, path)
    if (view.alive === undefined) active?.child(path, served)
    // One that starts from what its parent was given decodes it as one the server drew decodes its own.
    const from = served
      ? state as Saved
      : supplyOf(owner, path, view.alive !== undefined)
    if (from?.[path] === undefined) return fallback?.(owner, rec, at) === true
    // A kept child drawn in a receiver whose Layer builds, below its author, starts once it has, with
    // what its author last wrote: until then it holds the server's nodes, and its state isn't decoded.
    let receiver: Kernel.Instance | undefined
    for (
      let above = view.alive === undefined ? undefined : at;
      above !== undefined && above.length > owner.path.length;
      above = above.slice(0, above.lastIndexOf("/"))
    ) {
      const env = started.get(above)?.env
      if (
        env !== undefined && env.ctx === undefined && env.cause === undefined
      ) {
        receiver = started.get(above)
        break
      }
    }
    const env = receiver?.env
    const behind = receiver !== undefined
    // One the server drew elsewhere starts once the pass ends, from its state, with nodes of its own.
    const away = served && view.alive !== undefined &&
      active?.has(path) === false
    const exit = behind
      ? undefined
      : decode(view.component as never, from[path])
    if (exit !== undefined && Exit.isExit(exit) && !away) {
      if (!served && Exit.isFailure(exit)) {
        return fallback?.(owner, rec, at) === true
      }
      if (!served) given.set(path, from)
      decoded.set(path, Exit.isSuccess(exit) ? exit.value : undefined)
      return false
    }
    if (served && !away) active?.hold(path)
    held.set(rec, path)
    // Until it starts, history saves the server's state for it.
    const unwait = waits?.(owner, rec, path, {
      state: from[path],
      reported: from["~reported"]?.[path]
    })
    const go = (exit: Exit.Exit<Decoded, unknown>) => {
      const tree = owner.tree
      drops.delete(rec)
      tree.schedule(() => {
        unwait?.()
        // One no longer drawn leaves the server's nodes it held.
        const placeholder = rec.kids?.[0]!.node
        const range = adoption?.resume(placeholder)
        if (rec.inst === owner && !owner.closed && !tree.closed) {
          decoded.set(path, Exit.isSuccess(exit) ? exit.value : undefined)
          if (!served) given.set(path, from)
          resumed.add(rec)
          const outer = active
          active = range
          if (range !== undefined) use(host, range.host)
          resuming = true
          try {
            Kernel.settle(owner, rec, at)
          } finally {
            resuming = false
            active = outer
            use(host, outer?.host ?? base)
            decoded.delete(path)
            given.delete(path)
          }
        }
        range?.done()
        Kernel.flush(tree)
        // Only now, as what settling draws can ask whether adoption has.
        held.delete(rec)
        finish()
      })
    }
    if (exit !== undefined && Exit.isExit(exit)) go(exit)
    else if (exit !== undefined) {
      exit.addObserver(go)
      drops.set(rec, [owner, () => exit.interruptUnsafe()])
    } else {
      let waiting = true
      const wake = () => {
        if (!waiting) return
        waiting = false
        // One no longer drawn, or in a receiver that closed, isn't decoded.
        if (rec.inst !== owner || receiver!.closed) return go(Exit.interrupt())
        const exit = decode(view.component as never, from[path])
        if (Exit.isExit(exit)) go(exit)
        else exit.addObserver(go)
      }
      // Once the receiver has taken its author's latest write.
      env!.waiting.push(() => owner.tree.schedule(wake))
      ;(receiver!.closers ??= []).push(wake)
      drops.set(rec, [owner, wake])
    }
    return true
  }
  return {
    init(inst, first) {
      const path = inst.path
      const tree = inst.tree
      if (!hooked) {
        hooked = true
        tree.served = (inst) =>
          adopting.has(inst)
            ? (state["~status"] as Record<string, string> | undefined)
              ?.[inst.path] ?? "Ready"
            : undefined
        const ended = tree.ended
        tree.ended = (author, at) => {
          ended?.(author, at)
          claimed.add(at)
        }
        const work = tree.work
        tree.work = (idle) => {
          for (const [rec, [owner, drop]] of drops) {
            if (rec.inst !== owner) drop()
          }
          return work?.(idle) === true
        }
        const drawn = tree.drawn
        tree.drawn = (kept, on) => {
          drawn?.(kept, on)
          // One moved before its Layer builds, as it waits to adopt, leaves the server's nodes behind.
          const old = kept.rendered
          const env = kept.env
          if (
            on && !pass && old !== undefined && adopting.has(kept) &&
            env.ctx === undefined && env.cause === undefined
          ) {
            const ops = tree.ops
            const at = tree.host.parentOf(ops.nodeOf(old))
            kept.rendered = ops.create(kept, old.v)
            if (at != null) ops.unplace(tree.host, at, old)
            ops.release(kept, old)
          }
          if (on) parked.delete(kept)
          else parked.add(kept)
          settled()
        }
      }
      let got: Decoded | undefined
      if (!serves(inst.parent, path)) {
        const from = given.get(path)
        got = decoded.get(path)
        given.delete(path)
        decoded.delete(path)
        if (from === undefined || got === undefined) return undefined
        supplies.set(inst, from)
        inst.results = got.results
        return {
          model: got.model,
          commands: first.commands,
          events: noEvents,
          lists: first.lists,
          sends: first.sends
        }
      }
      if (
        (inst.at?.v as View.Child<any, any> | undefined)?.alive !== undefined
      ) {
        claimed.add(path)
      }
      if (decoded.has(path)) {
        got = decoded.get(path)
        decoded.delete(path)
      } else {
        const exit = decode(inst.component, state[path])
        if (Exit.isExit(exit) && Exit.isSuccess(exit)) got = exit.value
      }
      if (got === undefined) return undefined
      adopting.add(inst)
      started.set(path, inst)
      inst.results = got.results
      const owning = reportedOf(
        inst.component as unknown as Component.Any,
        state["~reported"]?.[path],
        true
      )
      if (owning !== undefined) {
        inst.owning = owning
        owners.push(inst)
      }
      return {
        model: got.model,
        commands: first.commands,
        events: noEvents,
        lists: first.lists,
        sends: first.sends
      }
    },
    adopts: (inst) => adopting.has(inst),
    parked(inst) {
      // Where it's drawn: a kept child's path is under its author, and the slot it's in under the receiver.
      const paths = [inst.path + "/"]
      for (let at: Kernel.Instance | undefined = inst; at; at = at.parent) {
        if (at.under !== undefined) paths.push(at.under + "/")
      }
      for (const kept of parked) {
        if (paths.some((path) => path.startsWith(kept.path + "/"))) return true
      }
      return false
    },
    held: () => [...held.values()],
    end() {
      pass = false
      const root = adoption?.root
      active = undefined
      use(host, base)
      root?.done()
      finish()
    },
    settled: () => !pass && held.size === 0
  }
}

/** @internal */
export interface Hydrating {
  readonly state: Renderer.State
  readonly adopt: Adopt | undefined
  readonly make: typeof make
  readonly decodeRoot: typeof decodeRoot
}

/** @internal */
export const hydrating = (
  state: Renderer.State,
  adopt?: Adopt
): Hydrating => ({ state, adopt, make, decodeRoot })
