import * as MessageLog from "@effect/ui/MessageLog"
import type * as Schema from "effect/Schema"
import type * as Inspector from "../Inspector.ts"

type Entry = MessageLog.WireEntry
type InstanceEntry = Exclude<Entry, { readonly _tag: "SessionStarted" | "FetchStarted" }>
type Source = Extract<Entry, { readonly _tag: "Update" }>["source"]
type Mutable<A> = { -readonly [K in keyof A]: A[K] }

interface Baseline {
  readonly seq: number
  readonly model: Schema.Json
  readonly props: Schema.Json
}

interface InstanceState {
  readonly info: Mutable<Inspector.Instance>
  readonly records: Array<Mutable<Inspector.Record>>
  readonly subscriptions: Map<string, Mutable<Inspector.Record>>
  layer: Mutable<Inspector.Record> | undefined
  state: number | undefined
  latest: Baseline | undefined
  baseline: Baseline | undefined
  buffered: number
}

type Emit = (
  kind: Inspector.Change["kind"],
  before: Schema.Json | undefined,
  after: Schema.Json | undefined
) => boolean

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

const compare = (before: Schema.Json, after: Schema.Json): boolean | "unknown" => {
  let unknown = false
  const changed = walk(before, after, [], (kind) => {
    if (kind !== "unknown") return true
    unknown = true
    return false
  })
  return changed || (unknown ? "unknown" : false)
}

export const diff = (before: Schema.Json, after: Schema.Json): ReadonlyArray<Inspector.Change> => {
  const changes: Array<Inspector.Change> = []
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

const matchTags = (exclude: ReadonlySet<string>) => (entry: Entry): boolean =>
  exclude.size > 0 &&
  entry._tag === "Update" &&
  typeof entry.message === "object" &&
  entry.message !== null &&
  "_tag" in entry.message &&
  typeof (entry.message as { readonly _tag?: unknown })._tag === "string" &&
  exclude.has((entry.message as { readonly _tag: string })._tag)

const makeSession = (id: string, size: number, isExcluded: (entry: Entry) => boolean) => {
  const entries = new Map<number, Entry>()
  const hidden = new Set<number>()
  const run = new Map<number, Entry>()
  const instances = new Map<number, InstanceState>()
  const runs = new Map<string, Mutable<Inspector.Record>>()
  const mounts = new Map<number, Mutable<Inspector.Record>>()
  const back = new Map<number, Array<Inspector.Link>>()
  const forward = new Map<number, Array<Inspector.Link>>()
  const previous = new Map<number, Inspector.Previous>()
  const ended = new Map<number, Array<Mutable<Inspector.Record>>>()
  let app: string | undefined
  let last = -Infinity
  let shown = 0

  const link = (from: number, rel: Inspector.Link["rel"], seq: number, index?: number) => {
    push(back, from, index === undefined ? { rel, seq } : { rel, seq, index })
    push(forward, seq, index === undefined ? { rel, seq: from } : { rel, seq: from, index })
  }

  const open = (inst: InstanceState, record: Mutable<Inspector.Record>) => {
    inst.records.push(record)
    return record
  }

  const close = (record: Mutable<Inspector.Record>, seq: number, reason: Inspector.Reason) => {
    record.end = seq
    record.reason = reason
    push(ended, seq, record)
  }

  const end = (seq: number, issued: MessageLog.Issued, reason: Inspector.Reason) => {
    link(seq, "issued", issued.seq, issued.index)
    const runRecord = runs.get(runKey(issued))
    if (runRecord !== undefined && runRecord.end === undefined) close(runRecord, seq, reason)
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
        latest: undefined,
        baseline: undefined,
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
          const before = entries.get(inst.state)
          if (before !== undefined && "model" in before) {
            previous.set(seq, { seq: inst.state, changed: compare(before.model, entry.model) })
          } else if (inst.baseline !== undefined && inst.baseline.seq === inst.state) {
            previous.set(seq, {
              seq: inst.state,
              changed: compare(inst.baseline.model, entry.model),
              model: inst.baseline.model,
              props: inst.baseline.props
            })
          } else {
            previous.set(seq, { seq: inst.state })
          }
        }
        inst.state = seq
        inst.latest = { seq, model: entry.model, props: entry.props }
        inst.baseline = undefined
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
      case "Failed": {
        if (entry.update !== undefined) linkSource(inst, seq, entry.update.source)
        if (entry.issued !== undefined) end(seq, entry.issued, "failed")
        return
      }
      case "Unmounted": {
        inst.info.unmounted = seq
        inst.latest = undefined
        inst.baseline = undefined
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
        let runRecord = runs.get(key)
        if (runRecord === undefined) {
          runRecord = open(inst, { kind: "command", instance, name: entry.name, issued: entry.issued })
          runs.set(key, runRecord)
        }
        runRecord.start = seq
        return
      }
      case "CommandAwaiting":
      case "SendDropped":
        return link(seq, "issued", entry.issued.seq, entry.issued.index)
      case "CommandEnded":
      case "CommandInterrupted":
      case "CommandDropped":
        return end(seq, entry.issued, entry._tag === "CommandEnded" ? "ended" : entry.reason)
    }
  }

  const evict = (seq: number, entry: Entry) => {
    entries.delete(seq)
    const wasHidden = hidden.delete(seq)
    if (!wasHidden) shown--
    if (wasHidden && "instance" in entry && run.get(entry.instance)?.seq === seq) run.delete(entry.instance)
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

  const session: Inspector.Session = {
    id,
    get app() {
      return app
    },
    entries: () => {
      if (hidden.size === 0) return Array.from(entries.values())
      const result: Array<Entry> = []
      for (const entry of entries.values()) {
        if (!hidden.has(entry.seq)) result.push(entry)
      }
      return result
    },
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
      for (const inst of instances.values()) {
        if (inst.info.unmounted !== undefined || inst.latest === undefined) continue
        inst.baseline = inst.latest
      }
      for (const [seq, entry] of Array.from(entries)) evict(seq, entry)
      run.clear()
    }
  }

  return {
    session,
    ingest: (entry: Entry) => {
      if (entry.seq <= last) return
      last = entry.seq
      if (entry._tag === "Update" && isExcluded(entry)) {
        const instId = entry.instance
        const replaced = run.get(instId)
        if (replaced !== undefined) {
          const inst = instances.get(instId)
          const prev = previous.get(replaced.seq)
          if (inst !== undefined && inst.state === replaced.seq) {
            inst.state = prev?.seq
            inst.baseline = prev !== undefined && prev.model !== undefined && prev.props !== undefined
              ? { seq: prev.seq, model: prev.model, props: prev.props }
              : undefined
          }
          evict(replaced.seq, replaced)
        }
        entries.set(entry.seq, entry)
        hidden.add(entry.seq)
        run.set(instId, entry)
      } else {
        run.clear()
        entries.set(entry.seq, entry)
        shown++
      }
      if (entry.causedBy !== undefined) link(entry.seq, "causedBy", entry.causedBy)
      if (entry._tag === "SessionStarted") app = entry.app
      else if (entry._tag !== "FetchStarted") track(entry)
      if (shown > size) {
        for (const [seq, oldest] of entries) {
          evict(seq, oldest)
          if (shown <= size) break
        }
      }
    }
  }
}

export const make = (options?: {
  readonly size?: number | undefined
  readonly exclude?: ReadonlyArray<string> | undefined
  readonly isExcluded?: ((entry: Entry) => boolean) | undefined
}): Inspector.Inspector => {
  const size = Math.max(1, options?.size ?? 1_000)
  const isExcluded = options?.isExcluded ?? matchTags(new Set(options?.exclude))
  const sessions = new Map<string, ReturnType<typeof makeSession>>()
  return {
    ingest: (batch) => {
      for (const entry of batch) {
        let state = sessions.get(entry.session)
        if (state === undefined) {
          state = makeSession(entry.session, size, isExcluded)
          sessions.set(entry.session, state)
        }
        state.ingest(entry)
      }
    },
    sessions: () => Array.from(sessions.values(), (state) => state.session)
  }
}
