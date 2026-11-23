/**
 * The inspector's core: it reads the Wire entries of a message log and keeps
 * what a devtools view asks of them. It has no UI and no Layer.
 *
 * `make` gives an `Inspector`, which keeps one `Session` for each session
 * id it's given entries of. A session holds its last entries in a ring buffer
 * and answers by `seq`: the entry behind a number, the entries an entry
 * names and the ones that name it, the Command run an `update` issued, the
 * Layer builds, Subscriptions, mounts and Command runs of an instance, and
 * the entry an instance's Model is compared with.
 *
 * It reads Wire frames only, so a `Schema.Redacted` value reaches it as the
 * encoder's placeholder and never in clear. It states what the entries say
 * and nothing else: a Command run has a start when the log has its
 * `CommandStarted`, and an end when the log has its end entry.
 *
 * **Example** (Feeding an inspector from a running app)
 *
 * ```ts
 * import { MessageLog } from "@effect/ui"
 * import { Inspector } from "@effect/ui-devtools"
 * import { Effect, Layer } from "effect"
 *
 * const inspector = Inspector.make()
 *
 * const InspectorLog = Layer.effect(
 *   MessageLog.MessageLog,
 *   MessageLog.makeEncoded((batch) => Effect.sync(() => inspector.ingest(batch)))
 * )
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as MessageLog from "@effect/ui/MessageLog"
import type * as Schema from "effect/Schema"

/**
 * What `Session.resolve` gives for a `seq` the session doesn't hold: the
 * ring buffer dropped the entry, the session was cleared, or the entry was
 * never given to it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Outside {
  readonly _tag: "Outside"
  readonly seq: number
}

/**
 * How a `Record` ended.
 *
 * **Details**
 *
 * - A Command run: `"ended"` for `CommandEnded`, `"server"` for
 *   `CommandDropped`, and the entry's own `reason` for
 *   `CommandInterrupted`: `"interrupt"`, `"switch"`, `"unmount"`,
 *   `"layer"` or `"self"`.
 * - A mount: `MountEnded`'s `reason`, `"completed"`, `"closed"` or
 *   `"failed"`.
 * - A Layer build: `"ready"` for `LayerReady`, `"failed"` for
 *   `LayerFailed`, and `"unmount"` for one still pending at its instance's
 *   `Unmounted`.
 * - A Subscription: `"stopped"` for `SubscriptionStopped`, and
 *   `"unmount"` for one still going at its instance's `Unmounted`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Reason =
  | MessageLog.InterruptReason
  | "ended"
  | "server"
  | "completed"
  | "closed"
  | "failed"
  | "ready"
  | "stopped"

/**
 * One thing an instance started that goes on for a while: a Layer build, a
 * Subscription, a mount or a Command run.
 *
 * **Details**
 *
 * `start` and `end` are the `seq` of the entries that started and ended
 * it, and `reason` says how it ended. A record without `end` is still open.
 *
 * - `"layer"`: from `LayerPending` to `LayerReady`, `LayerFailed` or the
 *   instance's `Unmounted`. `name` is the component's. A Layer that is
 *   built or fails at once logs no `LayerPending`, and has no record.
 * - `"subscription"`: from `SubscriptionStarted` to `SubscriptionStopped`
 *   or the instance's `Unmounted`. `name` and `key` are the
 *   Subscription's.
 * - `"mount"`: from `MountStarted` to `MountEnded`. `name` is the
 *   mount's.
 * - `"command"`: a Command run. `issued` is the entry that issued it and
 *   its index in that entry's `commands`, and `name` the Command's. The
 *   record begins when an `Update` or a `Mounted` issues the Command, and
 *   `start` is its `CommandStarted`. A run without `start` hasn't begun
 *   its work: it's queued in its group, it waits for its instance's Layer,
 *   or it was stopped first, and then it has an `end` and no `start`.
 *
 * A record is made from the entry that begins it. An entry about something
 * the session never saw begin makes none, so a session that was given the
 * end of a run and not its start doesn't say the run never started. The one
 * exception is a `CommandStarted` whose issuing entry the session never
 * had: it makes a record that has its `start`.
 *
 * On the server no Command runs, and the Commands `init` returned are
 * dropped without an entry, so their records stay open with no `start`.
 *
 * An open record outlives its entries: its `start` can be a `seq` that
 * `Session.resolve` no longer holds. A record that ended is kept while the
 * entry that ended it is in the buffer.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Record {
  readonly kind: "layer" | "subscription" | "mount" | "command"
  /** The `instance` number of the instance it belongs to. */
  readonly instance: number
  readonly name: string
  /** A Subscription's key. Only a `"subscription"` record has it. */
  readonly key?: string
  /** The entry that issued the run and its index in that entry's `commands`. Only a `"command"` record has it. */
  readonly issued?: MessageLog.Issued
  /** The `seq` of the entry that started it. Only a Command run can be without one. */
  readonly start?: number
  /** The `seq` of the entry that ended it. */
  readonly end?: number
  readonly reason?: Reason
}

/**
 * An instance the session has entries of.
 *
 * **Details**
 *
 * `mounted` and `unmounted` are the `seq` of its `Mounted` and
 * `Unmounted` entries, absent when the session wasn't given one. An
 * instance is kept while it's mounted. One that unmounted, or that the
 * session never saw mount, is dropped once the buffer holds none of its
 * entries and none of its records are left.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Instance {
  readonly instance: number
  readonly path: string
  readonly component: string
  readonly mounted?: number
  readonly unmounted?: number
}

/**
 * One entry naming another.
 *
 * **Details**
 *
 * From `Session.back`, `seq` is the entry named. From `Session.forward`,
 * it's the entry that names.
 *
 * - `"causedBy"`: the entry's `causedBy`.
 * - `"issued"`: the `issued` of a `CommandStarted`, `CommandAwaiting`,
 *   `CommandEnded`, `CommandInterrupted`, `CommandDropped` or
 *   `SendDropped`. `index` is its index.
 * - `"source"`: what sent the message of an `Update`, or of a `Failed`
 *   whose `update` threw. A Command's result names the entry that issued the
 *   run, with its `index`. A Subscription's message names the
 *   `SubscriptionStarted` of that key on the instance. A query, an emit, a
 *   failure, a send, a shared value and a mount name the `seq` the source
 *   carries. A DOM event, a dispatch and a collected report name nothing.
 * - `"started"`: a `MountEnded`'s `started`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Link {
  readonly rel: "causedBy" | "issued" | "source" | "started"
  readonly seq: number
  readonly index?: number
}

/**
 * The entry an instance's state is compared with: its `Waiting`, `Mounted`
 * or `Update` before this one.
 *
 * **Details**
 *
 * `changed` says whether the Model differs from that entry's: `true` when a
 * value differs, `false` when none does, and `"unknown"` when the only
 * values that could differ are placeholders (see `diff`).
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Previous {
  readonly seq: number
  readonly changed: boolean | "unknown"
}

/**
 * One difference between two Wire values, at `path`.
 *
 * **Details**
 *
 * `"changed"` has both values, `"added"` only `after` and `"removed"`
 * only `before`. `"unknown"` is a place where either value is a
 * placeholder: whether it changed can't be told.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Change {
  readonly kind: "changed" | "added" | "removed" | "unknown"
  readonly path: ReadonlyArray<string | number>
  readonly before?: Schema.Json
  readonly after?: Schema.Json
}

/**
 * What an inspector keeps of one session of a message log.
 *
 * **Details**
 *
 * Every `seq` an entry, a `Record`, a `Link` or a `Previous` holds goes
 * through `resolve`. What a method returns is a copy as of the call: it
 * doesn't change when the session is given more entries.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Session {
  readonly id: string
  /** The `app` of the session's `SessionStarted`, once the session was given it. */
  readonly app: string | undefined
  /** The entries in the buffer, oldest first. */
  readonly entries: () => ReadonlyArray<MessageLog.WireEntry>
  /** The entry with this `seq`, or `Outside` when the buffer doesn't hold it. */
  readonly resolve: (seq: number) => MessageLog.WireEntry | Outside
  /** The instances, in the order they were first seen. */
  readonly instances: () => ReadonlyArray<Instance>
  /** The records of one instance, or of every instance, oldest first within an instance. */
  readonly records: (instance?: number) => ReadonlyArray<Record>
  /** The record of the Command run an entry issued at this index. */
  readonly run: (issued: MessageLog.Issued) => Record | undefined
  /** The entries the entry with this `seq` names. */
  readonly back: (seq: number) => ReadonlyArray<Link>
  /** The entries in the buffer that name this `seq`, oldest first. */
  readonly forward: (seq: number) => ReadonlyArray<Link>
  /** For a `Waiting`, `Mounted` or `Update`: the instance's state entry before it, when there is one. */
  readonly previous: (seq: number) => Previous | undefined
  /**
   * Empties the buffer, as if every entry had been dropped from the ring.
   * Open records and mounted instances stay.
   */
  readonly clear: () => void
}

/**
 * Reads Wire entries into one `Session` for each session id.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Inspector {
  /**
   * Takes entries in the order they were logged. An entry whose `seq` isn't
   * above the last one its session was given is ignored, so a batch given
   * twice is read once.
   */
  readonly ingest: (batch: ReadonlyArray<MessageLog.WireEntry>) => void
  /** The sessions, in the order they were first seen. */
  readonly sessions: () => ReadonlyArray<Session>
}

type Entry = MessageLog.WireEntry
type InstanceEntry = Exclude<Entry, { readonly _tag: "SessionStarted" | "FetchStarted" }>
type StateEntry = Extract<Entry, { readonly _tag: "Waiting" | "Mounted" | "Update" }>
type Source = Extract<Entry, { readonly _tag: "Update" }>["source"]
type Mutable<A> = { -readonly [K in keyof A]: A[K] }

interface InstanceState {
  readonly info: Mutable<Instance>
  readonly records: Array<Mutable<Record>>
  readonly subscriptions: Map<string, Mutable<Record>>
  layer: Mutable<Record> | undefined
  state: StateEntry | undefined
  buffered: number
}

type Emit = (kind: Change["kind"], before: Schema.Json | undefined, after: Schema.Json | undefined) => boolean

const isObject = (value: Schema.Json): value is Schema.JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const walk = (before: Schema.Json, after: Schema.Json, path: Array<string | number>, emit: Emit): boolean => {
  if (MessageLog.isPlaceholder(before) || MessageLog.isPlaceholder(after)) return emit("unknown", before, after)
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length)
    for (let index = 0; index < length; index++) {
      path.push(index)
      const stop = index >= before.length
        ? emit("added", undefined, after[index])
        : index >= after.length
        ? emit("removed", before[index], undefined)
        : walk(before[index], after[index], path, emit)
      path.pop()
      if (stop) return true
    }
    return false
  }
  if (isObject(before) && isObject(after)) {
    for (const key of Object.keys(before)) {
      path.push(key)
      const stop = Object.hasOwn(after, key)
        ? walk(before[key], after[key], path, emit)
        : emit("removed", before[key], undefined)
      path.pop()
      if (stop) return true
    }
    for (const key of Object.keys(after)) {
      if (Object.hasOwn(before, key)) continue
      path.push(key)
      const stop = emit("added", undefined, after[key])
      path.pop()
      if (stop) return true
    }
    return false
  }
  return before !== after && emit("changed", before, after)
}

const compare = (before: Schema.Json, after: Schema.Json): Previous["changed"] => {
  let unknown = false
  const changed = walk(before, after, [], (kind) => {
    if (kind !== "unknown") return true
    unknown = true
    return false
  })
  return changed || (unknown ? "unknown" : false)
}

/**
 * Every difference between two Wire values, such as the Models of two
 * entries, in the order of `before`'s keys and then `after`'s new ones.
 *
 * **Details**
 *
 * Objects are compared key by key and arrays index by index, so an item
 * inserted at the front of an array reads as a change to every item after
 * it. A placeholder (see `MessageLog.isPlaceholder`) is a leaf whose value
 * isn't known, so a place where either value is one is reported as
 * `"unknown"`, even when both are the same placeholder.
 *
 * **Example** (Comparing two Models)
 *
 * ```ts
 * import { Inspector } from "@effect/ui-devtools"
 *
 * const changes = Inspector.diff(
 *   { status: "Dirty", token: { "~redacted": true } },
 *   { status: "Saving", token: { "~redacted": true } }
 * )
 *
 * console.log(changes)
 * // [
 * //   { kind: "changed", path: ["status"], before: "Dirty", after: "Saving" },
 * //   { kind: "unknown", path: ["token"], before: { "~redacted": true }, after: { "~redacted": true } }
 * // ]
 * ```
 *
 * @stability experimental
 * @category diffing
 * @since 0.1.0
 */
export const diff = (before: Schema.Json, after: Schema.Json): ReadonlyArray<Change> => {
  const changes: Array<Change> = []
  const path: Array<string | number> = []
  walk(before, after, path, (kind, from, to) => {
    changes.push({
      kind,
      path: path.slice(),
      ...(from === undefined ? undefined : { before: from }),
      ...(to === undefined ? undefined : { after: to })
    })
    return false
  })
  return changes
}

const runKey = (issued: MessageLog.Issued) => `${issued.seq}:${issued.index}`

const push = <K, V>(map: Map<K, Array<V>>, key: K, value: V) => {
  const list = map.get(key)
  if (list === undefined) map.set(key, [value])
  else list.push(value)
}

const makeSession = (id: string, size: number) => {
  const entries = new Map<number, Entry>()
  const instances = new Map<number, InstanceState>()
  const runs = new Map<string, Mutable<Record>>()
  const mounts = new Map<number, Mutable<Record>>()
  const back = new Map<number, Array<Link>>()
  const forward = new Map<number, Array<Link>>()
  const previous = new Map<number, Previous>()
  const ended = new Map<number, Array<Mutable<Record>>>()
  let app: string | undefined
  let last = -Infinity

  const link = (from: number, rel: Link["rel"], seq: number, index?: number) => {
    push(back, from, index === undefined ? { rel, seq } : { rel, seq, index })
    push(forward, seq, index === undefined ? { rel, seq: from } : { rel, seq: from, index })
  }

  const open = (inst: InstanceState, record: Mutable<Record>) => {
    inst.records.push(record)
    return record
  }

  const close = (record: Mutable<Record>, seq: number, reason: Reason) => {
    record.end = seq
    record.reason = reason
    push(ended, seq, record)
  }

  const linkSource = (inst: InstanceState, from: number, source: Source) => {
    switch (source._tag) {
      case "Command":
        return link(from, "source", source.issued.seq, source.issued.index)
      case "Subscription": {
        const start = inst.subscriptions.get(source.key)?.start
        return start === undefined ? undefined : link(from, "source", start)
      }
      case "Query":
      case "Emit":
      case "Failure":
      case "Send":
      case "Shared":
      case "Mount":
        return link(from, "source", source.seq)
    }
  }

  const track = (entry: InstanceEntry) => {
    let inst = instances.get(entry.instance)
    if (inst === undefined) {
      inst = {
        info: { instance: entry.instance, path: entry.path, component: entry.component },
        records: [],
        subscriptions: new Map(),
        layer: undefined,
        state: undefined,
        buffered: 0
      }
      instances.set(entry.instance, inst)
    }
    inst.buffered++
    const { instance, seq } = entry
    switch (entry._tag) {
      case "Waiting":
      case "Mounted":
      case "Update": {
        if (inst.state !== undefined) {
          previous.set(seq, { seq: inst.state.seq, changed: compare(inst.state.model, entry.model) })
        }
        inst.state = entry
        if (entry._tag === "Waiting") return
        if (entry._tag === "Mounted") inst.info.mounted = seq
        else linkSource(inst, seq, entry.source)
        for (let index = 0; index < entry.commands.length; index++) {
          const command = entry.commands[index]
          if (command._tag === "Interrupt") continue
          const issued = { seq, index }
          runs.set(runKey(issued), open(inst, { kind: "command", instance, name: command.name, issued }))
        }
        return
      }
      case "Failed":
        return entry.update === undefined ? undefined : linkSource(inst, seq, entry.update.source)
      case "Unmounted": {
        inst.info.unmounted = seq
        if (inst.layer !== undefined) close(inst.layer, seq, "unmount")
        inst.layer = undefined
        for (const record of inst.subscriptions.values()) close(record, seq, "unmount")
        inst.subscriptions.clear()
        return
      }
      case "LayerPending": {
        inst.layer ??= open(inst, { kind: "layer", instance, name: entry.component, start: seq })
        return
      }
      case "LayerReady":
      case "LayerFailed": {
        if (inst.layer !== undefined) close(inst.layer, seq, entry._tag === "LayerReady" ? "ready" : "failed")
        inst.layer = undefined
        return
      }
      case "SubscriptionStarted": {
        const record = open(inst, { kind: "subscription", instance, name: entry.name, key: entry.key, start: seq })
        inst.subscriptions.set(entry.key, record)
        return
      }
      case "SubscriptionStopped": {
        const record = inst.subscriptions.get(entry.key)
        if (record === undefined) return
        close(record, seq, "stopped")
        inst.subscriptions.delete(entry.key)
        return
      }
      case "MountStarted": {
        mounts.set(seq, open(inst, { kind: "mount", instance, name: entry.name, start: seq }))
        return
      }
      case "MountEnded": {
        link(seq, "started", entry.started)
        const record = mounts.get(entry.started)
        if (record === undefined) return
        close(record, seq, entry.reason)
        mounts.delete(entry.started)
        return
      }
      case "CommandStarted": {
        link(seq, "issued", entry.issued.seq, entry.issued.index)
        const key = runKey(entry.issued)
        let run = runs.get(key)
        if (run === undefined) {
          run = open(inst, { kind: "command", instance, name: entry.name, issued: entry.issued })
          runs.set(key, run)
        }
        run.start = seq
        return
      }
      case "CommandAwaiting":
      case "SendDropped":
        return link(seq, "issued", entry.issued.seq, entry.issued.index)
      case "CommandEnded":
      case "CommandInterrupted":
      case "CommandDropped": {
        link(seq, "issued", entry.issued.seq, entry.issued.index)
        const run = runs.get(runKey(entry.issued))
        if (run !== undefined && run.end === undefined) {
          close(run, seq, entry._tag === "CommandEnded" ? "ended" : entry.reason)
        }
        return
      }
    }
  }

  const evict = (seq: number, entry: Entry) => {
    entries.delete(seq)
    previous.delete(seq)
    for (const named of back.get(seq) ?? []) {
      const kept = forward.get(named.seq)?.filter((naming) => naming.seq !== seq)
      if (kept === undefined) continue
      if (kept.length === 0) forward.delete(named.seq)
      else forward.set(named.seq, kept)
    }
    back.delete(seq)
    for (const record of ended.get(seq) ?? []) {
      const records = instances.get(record.instance)!.records
      records.splice(records.indexOf(record), 1)
      if (record.issued !== undefined) runs.delete(runKey(record.issued))
    }
    ended.delete(seq)
    if (entry._tag === "SessionStarted" || entry._tag === "FetchStarted") return
    const inst = instances.get(entry.instance)!
    inst.buffered--
    if (
      inst.buffered === 0 && inst.records.length === 0 &&
      (inst.info.unmounted !== undefined || inst.info.mounted === undefined)
    ) instances.delete(entry.instance)
  }

  const session: Session = {
    id,
    get app() {
      return app
    },
    entries: () => Array.from(entries.values()),
    resolve: (seq) => entries.get(seq) ?? { _tag: "Outside", seq },
    instances: () => Array.from(instances.values(), (inst) => ({ ...inst.info })),
    records: (instance) =>
      (instance === undefined
        ? Array.from(instances.values()).flatMap((inst) => inst.records)
        : instances.get(instance)?.records ?? []).map((record) => ({ ...record })),
    run: (issued) => {
      const record = runs.get(runKey(issued))
      return record === undefined ? undefined : { ...record }
    },
    back: (seq) => back.get(seq)?.slice() ?? [],
    forward: (seq) => forward.get(seq)?.slice() ?? [],
    previous: (seq) => previous.get(seq),
    clear: () => {
      for (const [seq, entry] of Array.from(entries)) evict(seq, entry)
    }
  }

  return {
    session,
    ingest: (entry: Entry) => {
      if (entry.seq <= last) return
      last = entry.seq
      entries.set(entry.seq, entry)
      if (entry.causedBy !== undefined) link(entry.seq, "causedBy", entry.causedBy)
      if (entry._tag === "SessionStarted") app = entry.app
      else if (entry._tag !== "FetchStarted") track(entry)
      for (const [seq, oldest] of entries) {
        if (entries.size <= size) break
        evict(seq, oldest)
      }
    }
  }
}

/**
 * Makes an inspector whose sessions each hold their last `size` entries
 * (1,000 by default).
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = (options?: { readonly size?: number | undefined }): Inspector => {
  const size = Math.max(1, options?.size ?? 1_000)
  const sessions = new Map<string, ReturnType<typeof makeSession>>()
  return {
    ingest: (batch) => {
      for (const entry of batch) {
        let state = sessions.get(entry.session)
        if (state === undefined) {
          state = makeSession(entry.session, size)
          sessions.set(entry.session, state)
        }
        state.ingest(entry)
      }
    },
    sessions: () => Array.from(sessions.values(), (state) => state.session)
  }
}
