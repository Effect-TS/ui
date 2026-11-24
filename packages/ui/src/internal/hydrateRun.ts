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
  readonly done: () => void
}

/** @internal */
export interface Adoption<N = any> {
  readonly root: Adopting<N> | undefined
  readonly resume: (placeholder: N) => Adopting<N> | undefined
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
  readonly held: () => ReadonlyArray<string>
  readonly end: () => void
  readonly settled: () => boolean
}

const methods = [
  "createElement",
  "createText",
  "setAttr",
  "setProp",
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

const noEvents: ReadonlyArray<unknown> = []

/** @internal */
export const make = (
  state: Renderer.State,
  host: Kernel.Host,
  base: Kernel.Host,
  adoption: Adoption | undefined,
  settled: () => void
): Hydration => {
  const deferred = new Set(state["~deferred"])
  const adopting = new WeakSet<Kernel.Instance>()
  const decoded = new Map<string, Decoded | undefined>()
  const resumed = new WeakSet<Kernel.Rec>()
  const held = new Map<Kernel.Rec, string>()
  // Owners that adopted what their reports sent on the server, compared once nothing below waits to adopt.
  const owners: Array<Kernel.Instance> = []
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
        for (const [node, [rec, first]] of wanted) {
          if (!rec.inst.closed) setEvents(node, rec, first)
        }
      })
    }
    queued.set(node, [rec, queued.get(node)?.[1] ?? first])
  }
  const finish = () => {
    if (pass || held.size > 0) return
    for (const owner of owners.splice(0)) restored(owner)
    settled()
  }
  ;(host as { hold: Kernel.Host["hold"] }).hold = (owner, rec, at) => {
    const view = rec.v as View.Child<any, any>
    const path = (at ?? owner.path) + "/" + segmentOf(view.component, view.key)
    if (resumed.delete(rec) || !serves(owner, path)) return false
    const exit = decode(view.component as never, state[path])
    if (Exit.isExit(exit)) {
      decoded.set(path, Exit.isSuccess(exit) ? exit.value : undefined)
      return false
    }
    active?.hold(path)
    held.set(rec, path)
    exit.addObserver((exit) => {
      const tree = owner.tree
      tree.schedule(() => {
        held.delete(rec)
        const placeholder = rec.inst === owner && rec.kids !== undefined
          ? rec.kids[0]!.node
          : undefined
        const range = adoption?.resume(placeholder)
        if (placeholder !== undefined && !owner.closed && !tree.closed) {
          decoded.set(path, Exit.isSuccess(exit) ? exit.value : undefined)
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
          }
        }
        range?.done()
        Kernel.flush(tree)
        finish()
      })
    })
    return true
  }
  return {
    init(inst, first) {
      const path = inst.path
      if (!serves(inst.parent, path)) return undefined
      let got: Decoded | undefined
      if (decoded.has(path)) {
        got = decoded.get(path)
        decoded.delete(path)
      } else {
        const exit = decode(inst.component, state[path])
        if (Exit.isExit(exit) && Exit.isSuccess(exit)) got = exit.value
      }
      if (got === undefined) return undefined
      adopting.add(inst)
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
