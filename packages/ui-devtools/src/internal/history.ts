import type * as BrowserHost from "@effect/ui/html/BrowserHost"
import * as MessageLog from "@effect/ui/MessageLog"

type Entry = MessageLog.Entry | MessageLog.WireEntry

export interface Held {
  readonly path: string
  readonly model: unknown
  readonly props: unknown
  readonly queries: unknown
  readonly unmounted?: number | undefined
}

export type State = (path: string) => BrowserHost.Recorded | undefined

export interface History {
  readonly record: (entry: Entry) => void
  readonly clear: (session: string, upTo: number) => void
  readonly drop: (session: string) => void
  readonly holds: (session: string, seq: number) => boolean
  /** An entry held, shown or excluded. */
  readonly entry: (session: string, seq: number) => Entry | undefined
  /**
   * The entry a shown `PropsChanged` at `seq` was caused by, while the
   * `PropsChanged` is held, even once the cause is evicted.
   */
  readonly cause: (session: string, seq: number) => Entry | undefined
  /** The last seq recorded, excluded entries included. */
  readonly latest: (session: string) => number | undefined
  /**
   * Why a seq up to `latest` isn't held: older than every entry kept, in a
   * range that never arrived, or else an excluded entry not kept.
   */
  readonly missing: (
    session: string,
    seq: number
  ) => "evicted" | "skipped" | "excluded"
  readonly at: (session: string, seq: number) => State | undefined
  readonly instanceAt: (
    session: string,
    seq: number,
    instance: number
  ) => Held | "outside" | undefined
}

const merge = (queries: unknown, name: string, result: unknown) =>
  MessageLog.isPlaceholder(queries)
    ? queries
    : { ...(queries as object | undefined), [name]: result }

const apply = (
  states: Map<number, Held>,
  entry: Entry,
  keepUnmounted: boolean
) => {
  switch (entry._tag) {
    case "Waiting":
    case "Mounted":
    case "Update":
      states.set(entry.instance, {
        path: entry.path,
        props: entry.props,
        model: entry.model,
        queries: entry.queries ?? states.get(entry.instance)?.queries
      })
      return
    case "PropsChanged": {
      const held = states.get(entry.instance)
      if (held !== undefined) {
        states.set(entry.instance, { ...held, props: entry.props })
      }
      return
    }
    case "QueryChanged": {
      const held = states.get(entry.instance)
      if (held !== undefined) {
        states.set(entry.instance, {
          ...held,
          queries: merge(held.queries, entry.name, entry.result)
        })
      }
      return
    }
    case "Unmounted": {
      const held = states.get(entry.instance)
      if (keepUnmounted && held !== undefined) {
        states.set(entry.instance, { ...held, unmounted: entry.seq })
      } else states.delete(entry.instance)
      return
    }
  }
}

const isDirty = (dirty: ReadonlySet<string>, path: string) => {
  if (dirty.has(path)) return true
  for (const ancestor of dirty) {
    if (path.startsWith(ancestor + "/")) return true
  }
  return false
}

// What an excluded entry replaces: the instance's earlier one with its key.
const keyOf = (entry: Entry): string | undefined => {
  switch (entry._tag) {
    case "Waiting":
    case "Mounted":
    case "Update":
      return "state"
    case "PropsChanged":
      return "props"
    case "QueryChanged":
      return "query:" + entry.name
  }
}

// A state entry without query results keeps those of the one it replaces,
// with any result that changed after it. When the replaced one had none
// either, the query changes kept apply over the earlier state.
type StateEntry = Extract<
  Entry,
  { readonly _tag: "Waiting" | "Mounted" | "Update" }
>

const carryQueries = (
  entry: StateEntry,
  replaced: StateEntry,
  kept: ReadonlyMap<string, Entry>
): Entry => {
  if (entry.queries !== undefined || replaced.queries === undefined) {
    return entry
  }
  let queries: unknown = replaced.queries
  for (const changed of kept.values()) {
    if (changed._tag === "QueryChanged" && changed.seq > replaced.seq) {
      queries = merge(queries, changed.name, changed.result)
    }
  }
  return queries === undefined ? entry : { ...entry, queries } as Entry
}

const makeSession = (size: number) => {
  const base = new Map<number, Held>()
  // Every entry held by seq, oldest first, and which of them are shown.
  const entries = new Map<number, Entry>()
  const shown = new Set<number>()
  const causes = new Map<number, Entry>()
  // Excluded entries since the last shown one, by instance: only the latest
  // state, props and result of each query matter to the next shown entry.
  const coalesced = new Map<number, Map<string, Entry>>()
  // Ranges of seqs that never arrived, kept until older than the entries held.
  const gaps: Array<readonly [number, number]> = []
  let floor = -Infinity
  let last = -Infinity
  // Instance numbers grow, so one above `settled` mounted since the last shown entry.
  let newest = -1
  let settled = -1
  let shownSeq = -Infinity
  const painting = new Set<string>()
  const drop = (oldest: Entry) => {
    entries.delete(oldest.seq)
    floor = oldest.seq
    shown.delete(oldest.seq)
    causes.delete(oldest.seq)
    const kept = "instance" in oldest
      ? coalesced.get(oldest.instance)
      : undefined
    if (kept !== undefined) {
      for (const [key, entry] of kept) {
        if (entry === oldest) kept.delete(key)
      }
    }
    apply(base, oldest, false)
    while (gaps.length > 0 && gaps[0]![1] < floor) gaps.shift()
  }
  const exclude = (entry: Entry & { readonly instance: number }) => {
    let kept = coalesced.get(entry.instance)
    if (entry._tag === "Unmounted") {
      // An instance that came and went between shown entries leaves no trace,
      // but for a mount a shown entry caused or one Clear folded into `base`.
      if (entry.instance > settled && !base.has(entry.instance)) {
        const mount = kept?.get("mount")
        if (kept !== undefined) {
          for (const replaced of kept.values()) {
            if (replaced !== mount) entries.delete(replaced.seq)
          }
        }
        coalesced.delete(entry.instance)
        if (mount === undefined) return
      }
      entries.set(entry.seq, entry)
      return
    }
    // The first mount at a path that a shown entry caused keeps its own slot:
    // Time travel at that entry paints it, whatever the instance does next.
    // Time travel can't use a later one at the same path.
    const causal = (entry._tag === "Mounted" || entry._tag === "Waiting") &&
      entry.causedBy !== undefined && entry.causedBy <= shownSeq &&
      !painting.has(entry.path)
    const key = causal ? "mount" : keyOf(entry)
    if (key === undefined) return
    if (causal) painting.add(entry.path)
    if (kept === undefined) coalesced.set(entry.instance, kept = new Map())
    const replaced = kept.get(key)
    if (replaced !== undefined) entries.delete(replaced.seq)
    const held = key === "state" && replaced !== undefined
      ? carryQueries(entry as StateEntry, replaced as StateEntry, kept)
      : entry
    kept.set(key, held)
    entries.set(held.seq, held)
  }
  const fold = (seq: number) => {
    const states = new Map(base)
    for (const entry of entries.values()) {
      if (entry.seq > seq) break
      apply(states, entry, true)
    }
    return states
  }
  return {
    record: (entry: Entry) => {
      if (entry.seq <= last) return
      if (entry.seq > last + 1 && last !== -Infinity) {
        gaps.push([last + 1, entry.seq - 1])
      }
      last = entry.seq
      if ("instance" in entry) {
        newest = Math.max(newest, entry.instance)
        if (entry.excluded === true) return exclude(entry)
      }
      coalesced.clear()
      painting.clear()
      settled = newest
      shownSeq = entry.seq
      entries.set(entry.seq, entry)
      shown.add(entry.seq)
      const cause =
        entry._tag === "PropsChanged" && entry.causedBy !== undefined
          ? entries.get(entry.causedBy)
          : undefined
      if (cause !== undefined) causes.set(entry.seq, cause)
      for (const oldest of entries.values()) {
        if (shown.size <= size) break
        drop(oldest)
      }
    },
    clear: (upTo: number) => {
      for (const oldest of entries.values()) {
        if (oldest.seq > upTo) break
        drop(oldest)
      }
    },
    holds: (seq: number) => shown.has(seq),
    entry: (seq: number) => entries.get(seq),
    cause: (seq: number) => causes.get(seq),
    latest: () => last,
    missing: (seq: number) =>
      seq <= floor
        ? "evicted" as const
        : gaps.some(([from, to]) => from <= seq && seq <= to)
        ? "skipped" as const
        : "excluded" as const,
    at: (seq: number): State => {
      const states = fold(seq)
      const byPath = new Map<string, BrowserHost.Recorded>()
      for (const instance of Array.from(states.keys()).sort((a, b) => a - b)) {
        const { path, unmounted, ...recorded } = states.get(instance)!
        if (unmounted === undefined) {
          byPath.set(path, recorded as BrowserHost.Recorded)
        }
      }
      // A render can log child mounts after the selected entry, even when their
      // cause is at or before it. Changes to a path or ancestor block reuse.
      const dirty = new Set<string>()
      for (const entry of entries.values()) {
        if (entry.seq <= seq) continue
        switch (entry._tag) {
          case "Mounted":
          case "Waiting":
            if (
              entry.causedBy !== undefined && entry.causedBy <= seq &&
              !byPath.has(entry.path) && !isDirty(dirty, entry.path)
            ) {
              byPath.set(entry.path, {
                props: entry.props,
                model: entry.model,
                queries: entry.queries
              } as BrowserHost.Recorded)
            }
            break
          case "Update":
          case "PropsChanged":
          case "QueryChanged":
          case "Unmounted":
            dirty.add(entry.path)
            break
        }
      }
      return (path) => byPath.get(path)
    },
    instanceAt: (seq: number, instance: number): Held | "outside" | undefined =>
      seq < floor ? "outside" : fold(seq).get(instance)
  }
}

export const make = (size: number): History => {
  const sessions = new Map<string, ReturnType<typeof makeSession>>()
  return {
    record: (entry) => {
      let session = sessions.get(entry.session)
      if (session === undefined) {
        sessions.set(entry.session, session = makeSession(size))
      }
      session.record(entry)
    },
    clear: (session, upTo) => {
      sessions.get(session)?.clear(upTo)
    },
    drop: (session) => {
      sessions.delete(session)
    },
    holds: (session, seq) => sessions.get(session)?.holds(seq) ?? false,
    entry: (session, seq) => sessions.get(session)?.entry(seq),
    cause: (session, seq) => sessions.get(session)?.cause(seq),
    latest: (session) => sessions.get(session)?.latest(),
    missing: (session, seq) => sessions.get(session)?.missing(seq) ?? "evicted",
    at: (session, seq) => {
      const held = sessions.get(session)
      return held === undefined || !held.holds(seq) ? undefined : held.at(seq)
    },
    instanceAt: (session, seq, instance) =>
      sessions.get(session)?.instanceAt(seq, instance)
  }
}
