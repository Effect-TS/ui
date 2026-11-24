/**
 * Builds the message log's entries from what the kernel records: their numbers, the session, and the
 * fact each one follows from. The kernel doesn't import it, so an app that makes no log doesn't carry it.
 *
 * @internal
 */
import type * as Clock from "effect/Clock"
import type * as MessageLog from "../MessageLog.ts"
import * as Kernel from "./kernel.ts"
import { boundOf } from "./queryCore.ts"

/** @internal */
export interface Recording {
  readonly record: Kernel.Recorder
  /** Runs something that reached the tree from outside it, and what follows from it before it returns. */
  readonly step: <A>(f: () => A) => A
  /** Runs `f` as what follows from the session's start. */
  readonly session: <A>(f: () => A) => A
  /** Runs a function later as what follows from the fact running now, or as a fact of its own. */
  readonly follow: NonNullable<Kernel.Tree["follow"]>
  /** Logs an entry about the tree, such as a fetch that started. */
  readonly tree: (
    draft: { readonly _tag: string; readonly [field: string]: unknown }
  ) => void
}

const dispatched: MessageLog.Source = { _tag: "Dispatch" }

/** @internal */
export const make = (
  log: MessageLog.MessageLog,
  clock: Clock.Clock,
  session: string,
  app: string
): Recording => {
  const numbers = new WeakMap<Kernel.Instance, number>()
  const seqs = new WeakMap<Kernel.Instance, number>()
  const causes = new WeakMap<Kernel.Instance, number>()
  const outer: Array<number | boolean | undefined> = []
  let born = 0
  let seq = 0
  let origin: number | undefined
  let depth = 0
  let starting = false
  const number = (): number => {
    const next = ++seq
    const cause = origin
    if (starting) {
      starting = false
      origin = cause ?? next
    }
    return next
  }
  const under = <A>(
    cause: number | undefined,
    f: () => A,
    start = false
  ): A => {
    const was = origin
    const wasStarting = starting
    origin = cause
    starting = start && cause === undefined
    depth++
    try {
      return f()
    } finally {
      depth--
      origin = was
      starting = wasStarting
    }
  }
  const step = <A>(f: () => A): A => depth > 0 ? f() : under(undefined, f, true)
  const stamp = (cause: number | undefined, next: number) => ({
    seq: next,
    ...(cause === undefined ? undefined : { causedBy: cause }),
    at: clock.currentTimeMillisUnsafe(),
    session
  })
  const sourceOf = (source: unknown): MessageLog.Source =>
    typeof source === "string"
      ? { _tag: "DomEvent", name: source }
      : source instanceof Kernel.Instance
      ? {
        _tag: source.closed ? "Failure" : "Emit",
        path: source.path,
        seq: seqs.get(source) ?? -1
      }
      : (source as MessageLog.Source | undefined) ?? dispatched
  /**
   * The provider whose Layer entries the feature slots in `inst`'s view read: the one above, `inst`
   * included, whose own Env is the one `inst` renders with. None for an Env that is always ready.
   */
  const boundaryOf = (inst: Kernel.Instance): number | undefined => {
    for (
      let at: Kernel.Instance | undefined = inst;
      at !== undefined;
      at = at.parent
    ) {
      if (at.component.layer !== undefined && at.env === inst.env) {
        return numbers.get(at)
      }
    }
    return undefined
  }
  const record: Kernel.Recorder = (inst, draft) => {
    switch (draft._tag) {
      case "Render": {
        outer.push(origin, starting)
        origin = causes.get(inst)
        causes.delete(inst)
        starting = false
        depth++
        return
      }
      case "Rendered": {
        depth--
        starting = outer.pop() as boolean
        origin = outer.pop() as number | undefined
        return
      }
    }
    if (!log.enabled) return
    let instance = numbers.get(inst)
    if (instance === undefined) numbers.set(inst, instance = born++)
    const cause = origin
    const next = number()
    const entry: Record<string, unknown> = {
      ...draft,
      ...stamp(cause, next),
      path: inst.path,
      instance,
      component: inst.component
    }
    if (draft._tag === "Update" || draft._tag === "Mounted") {
      const boundary = boundaryOf(inst)
      if (boundary !== undefined) entry.boundary = boundary
      const bound = boundOf(inst.component as never)
      if (bound !== undefined) entry.queries = inst.results ?? bound.empty
    }
    switch (draft._tag) {
      case "Update": {
        entry.source = sourceOf(draft.source)
        if (draft.viewTransition === undefined) delete entry.viewTransition
        entry.lists = draft.lists ?? []
        entry.sends = []
        if (draft.model !== inst.model && origin !== undefined) {
          causes.set(inst, origin)
        }
        seqs.set(inst, next)
        break
      }
      case "PropsChanged": {
        if (origin !== undefined) causes.set(inst, origin)
        break
      }
      case "Mounted": {
        seqs.set(inst, next)
        break
      }
      case "Failed": {
        const update = draft.update as {
          readonly message: unknown
          readonly source: unknown
        } | undefined
        if (update === undefined) delete entry.update
        else {entry.update = {
            message: update.message,
            source: sourceOf(update.source)
          }}
        seqs.set(inst, next)
        break
      }
    }
    log.record(entry as unknown as MessageLog.Entry)
    return next
  }
  return {
    record,
    step,
    session: (f) => {
      if (!log.enabled) return under(undefined, f)
      const next = ++seq
      log.record(
        {
          _tag: "SessionStarted",
          app,
          ...stamp(undefined, next)
        } as MessageLog.Entry
      )
      return under(next, f)
    },
    follow: () => {
      const from = origin
      return from === undefined ? step : (f) => under(from, f)
    },
    tree: (draft) => {
      if (!log.enabled) return
      const cause = origin
      log.record(
        { ...draft, ...stamp(cause, number()) } as unknown as MessageLog.Entry
      )
    }
  }
}
