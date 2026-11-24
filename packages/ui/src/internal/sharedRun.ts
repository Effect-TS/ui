/**
 * @internal
 */
import * as Cause from "effect/Cause"
import type * as Component from "../Component.ts"
import * as View from "../View.ts"
import { sharedEqual } from "./equal.ts"
import type * as Kernel from "./kernel.ts"
import { readsOf } from "./shared.ts"

type Inst = Kernel.Instance

interface Owning {
  value: unknown
  readonly readers: Set<Inst>
  seq: number | undefined | void
  round: boolean
  collected: { readonly message: unknown } | undefined
  /** Set while hydration may still adopt a reader: the first comparison with what the server collected waits. */
  held: boolean
}

interface Reading {
  readonly owners: Map<Component.Definition.Any, Inst>
  readonly seen: Map<Inst, unknown>
}

interface Shared {
  readonly owners: Set<Inst>
  readonly rounds: Array<Inst>
  readonly due: Set<Inst>
  readonly passes: Map<Inst, number>
  readonly sends: Map<Inst, number>
}

const max = 100

const sharedOf = (tree: Kernel.Tree): Shared => {
  let shared = tree.shared as Shared | undefined
  if (shared === undefined) {
    const made: Shared = shared = {
      owners: new Set(),
      rounds: [],
      due: new Set(),
      passes: new Map(),
      sends: new Map()
    }
    tree.shared = made
    const work = tree.work
    tree.work = (idle) => work?.(idle) === true || run(made, idle)
  }
  return shared
}

const run = (shared: Shared, idle: boolean): boolean => {
  if (shared.rounds.length > 0) {
    for (const owner of shared.rounds.splice(0)) round(owner)
    return true
  }
  if (!idle) return false
  if (shared.due.size > 0) {
    for (const owner of Array.from(shared.due)) {
      shared.due.delete(owner)
      collect(owner)
    }
    return true
  }
  shared.passes.clear()
  shared.sends.clear()
  return false
}

const fail = (
  inst: Inst,
  where: Kernel.FailedIn,
  error: unknown,
  name?: string
) =>
  inst.tree.ops.fail(inst, where, Cause.die(error), undefined, undefined, name)

const definitionOf = (inst: Inst): Component.Definition.Any =>
  (inst.component as unknown as Component.Any).definition

const above = (
  inst: Inst,
  test: (owner: Inst) => boolean
): Inst | undefined => {
  let found: Inst | undefined
  const path = inst.path
  for (const owner of sharedOf(inst.tree).owners) {
    if (
      !owner.closed && path.startsWith(owner.path + "/") && test(owner) &&
      (found === undefined || owner.path.length > found.path.length)
    ) found = owner
  }
  return found
}

const nearest = (inst: Inst, definition: Component.Definition.Any) =>
  above(inst, (owner) => definitionOf(owner) === definition)

const absent = (inst: Inst, definition: Component.Definition.Any): string => {
  const other = above(
    inst,
    (owner) => definitionOf(owner).name === definition.name
  )
  return other === undefined
    ? "and no " + definition.name + " is above it"
    : "but a different component with the same name is above it at " +
      other.path
}

/** @internal */
export const first = (inst: Inst): void => {
  const definition = definitionOf(inst)
  const reads = readsOf(definition)
  if (reads.length > 0) {
    const reading: Reading = { owners: new Map(), seen: new Map() }
    for (const read of reads) {
      const owned = read.owner.definition
      const owner = nearest(inst, owned)
      if (owner === undefined) {
        if (read.optional) continue
        return fail(
          inst,
          "shared",
          new Error(
            inst.path + " reads the shared state of " + owned.name + ", " +
              absent(inst, owned)
          )
        )
      }
      reading.owners.set(owned, owner)
      ;(owner.owning as Owning).readers.add(inst)
      if (read.onChange !== undefined) {
        reading.seen.set(owner, (owner.owning as Owning).value)
      }
    }
    inst.reading = reading
    inst.look = (owner) =>
      (reading.owners.get(owner.definition)?.owning as Owning | undefined)
        ?.value
  }
  if (definition.shares !== undefined) {
    // Hydration may have given it what its reports last sent on the server.
    const saved = inst.owning as Partial<Owning> | undefined
    inst.owning = {
      value: undefined,
      readers: new Set(),
      seq: undefined,
      round: false,
      collected: saved?.collected,
      held: saved?.held === true
    } satisfies Owning
    sharedOf(inst.tree).owners.add(inst)
    refresh(inst, undefined)
    // Restored from history: compared once the pass settles, readers or none.
    if (saved?.collected !== undefined && !saved.held) due(inst)
  }
  report(inst)
  ;(inst.closers ??= []).push(() => leave(inst))
}

/**
 * Compares an owner's reports with what they sent on the server, once hydration adopted everything
 * below it: an owner whose readers are gone on the client is compared too.
 *
 * @internal
 */
export const restored = (owner: Inst): void => {
  const owning = owner.owning as Owning | undefined
  if (owning === undefined || owner.closed) return
  owning.held = false
  due(owner)
}

const due = (owner: Inst): void => {
  const tree = owner.tree
  sharedOf(tree).due.add(owner)
  if (!tree.scheduled) {
    tree.scheduled = true
    tree.schedule(() => tree.ops.flush(tree))
  }
}

const leave = (inst: Inst): void => {
  report(inst)
  const reading = inst.reading as Reading | undefined
  if (reading !== undefined) {
    for (const owner of reading.owners.values()) {
      ;(owner.owning as Owning).readers.delete(inst)
    }
  }
  if (inst.owning !== undefined) sharedOf(inst.tree).owners.delete(inst)
}

/** @internal */
export const sync = (
  inst: Inst,
  next: Kernel.Next | undefined,
  seq: number | undefined | void
): void => {
  if (inst.owning !== undefined && !refresh(inst, seq)) return
  report(inst)
  const sends = next?.sends as ReadonlyArray<Component.Send> | undefined
  if (sends !== undefined && sends.length > 0) send(inst, sends, seq)
}

const refresh = (inst: Inst, seq: number | undefined | void): boolean => {
  const owning = inst.owning as Owning
  let value: unknown
  try {
    value = definitionOf(inst).shares!(inst.model, inst.props)
  } catch (error) {
    fail(inst, "shares", error)
    return false
  }
  if (sharedEqual(owning.value, value)) return true
  owning.value = value
  owning.seq = seq
  let listened = false
  for (const reader of owning.readers) {
    if (reader.closed) continue
    inst.tree.ops.markDirty(reader)
    if ((reader.reading as Reading).seen.has(inst)) listened = true
  }
  if (listened && !owning.round) {
    owning.round = true
    sharedOf(inst.tree).rounds.push(inst)
  }
  return true
}

const report = (inst: Inst): void => {
  const reading = inst.reading as Reading | undefined
  if (reading === undefined) return
  for (const read of readsOf(definitionOf(inst))) {
    if (read.report === undefined) continue
    const owner = reading.owners.get(read.owner.definition)
    if (owner !== undefined && definitionOf(owner).collects !== undefined) {
      due(owner)
    }
  }
}

const count = (
  passes: Map<Inst, number>,
  inst: Inst,
  where: Kernel.FailedIn,
  message: string
): boolean => {
  const passed = (passes.get(inst) ?? 0) + 1
  passes.set(inst, passed)
  if (passed <= max) return true
  fail(inst, where, new Error(inst.path + message))
  return false
}

const countShared = (owner: Inst): boolean =>
  count(
    sharedOf(owner.tree).passes,
    owner,
    "shares",
    " sent its readers' onChange or its own collects.onChange " + max +
      " times in one flush. A reader whose onChange or report answers the shared value with a change of it loops: answer with a value that settles."
  )

const round = (owner: Inst): void => {
  const owning = owner.owning as Owning
  owning.round = false
  if (owner.closed) return
  const value = owning.value
  const seq = owning.seq
  let counted = false
  for (const reader of Array.from(owning.readers)) {
    const reading = reader.reading as Reading
    if (
      reader.closed || !reading.seen.has(owner) ||
      sharedEqual(reading.seen.get(owner), value)
    ) continue
    if (!counted) {
      counted = true
      if (!countShared(owner)) return
    }
    reading.seen.set(owner, value)
    const read = readsOf(definitionOf(reader)).find((read) =>
      read.onChange !== undefined &&
      reading.owners.get(read.owner.definition) === owner
    )!
    let message: unknown
    try {
      message = read.onChange!(value)
    } catch (error) {
      fail(reader, "shared", error, read.name)
    }
    if (message !== undefined && !reader.closed) {
      owner.tree.ops.send(reader, message, {
        _tag: "Shared",
        name: read.name,
        path: owner.path,
        seq
      })
    }
    if (owner.closed) return
  }
}

const collect = (owner: Inst): void => {
  const collects = definitionOf(owner).collects
  const owning = owner.owning as Owning
  if (collects === undefined || owner.closed || owning.held) return
  const reports: Array<unknown> = []
  for (const reader of owning.readers) {
    if (reader.closed) continue
    const reading = reader.reading as Reading
    for (const read of readsOf(definitionOf(reader))) {
      if (
        read.report === undefined ||
        reading.owners.get(read.owner.definition) !== owner
      ) continue
      try {
        reports.push(
          read.report(
            reader.model,
            reader.props,
            (name, key) => View.idOf(reader.path, name, key)
          )
        )
      } catch (error) {
        return fail(reader, "shared", error, read.name)
      }
    }
  }
  let message: unknown
  try {
    owning.collected ??= { message: collects.onChange([]) }
    message = collects.onChange(reports as Array<never>)
  } catch (error) {
    return fail(owner, "shares", error)
  }
  if (sharedEqual(owning.collected.message, message)) return
  owning.collected = { message }
  if (countShared(owner)) {
    owner.tree.ops.send(owner, message, { _tag: "Collected" })
  }
}

const send = (
  inst: Inst,
  sends: ReadonlyArray<Component.Send>,
  seq: number | undefined | void
): void => {
  if (
    !count(
      sharedOf(inst.tree).sends,
      inst,
      "send",
      " sent to its owners " + max +
        " times in one flush. Updates that answer each other loop: answer a send with state, or send from a user event."
    )
  ) return
  for (let index = 0; index < sends.length; index++) {
    if (inst.closed) return
    const definition = sends[index]!.owner.definition
    const owner = nearest(inst, definition)
    if (owner !== undefined) {
      inst.tree.ops.send(owner, sends[index]!.message, {
        _tag: "Send",
        path: inst.path,
        seq
      })
    } else if (
      readsOf(definitionOf(inst)).some((read) =>
        read.optional && read.owner.definition === definition
      )
    ) {
      inst.tree.log?.(inst, {
        _tag: "SendDropped",
        owner: definition.name,
        issued: { seq, index }
      })
    } else {
      return fail(
        inst,
        "send",
        new Error(
          inst.path + " sent to " + definition.name + ", " +
            absent(inst, definition)
        )
      )
    }
  }
}
