import type * as BrowserHost from "@effect/ui/html/BrowserHost"
import type * as MessageLog from "@effect/ui/MessageLog"

interface Held extends BrowserHost.Recorded {
  readonly path: string
}

type State = (path: string) => BrowserHost.Recorded | undefined

export interface History {
  readonly record: (entry: MessageLog.Entry, excluded?: boolean) => void
  readonly clear: (session: string, upTo: number) => void
  readonly holds: (session: string, seq: number) => boolean
  readonly at: (session: string, seq: number) => State | undefined
}

const apply = (states: Map<number, Held>, entry: MessageLog.Entry) => {
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
          queries: { ...held.queries, [entry.name]: entry.result }
        })
      }
      return
    }
    case "Unmounted":
      states.delete(entry.instance)
      return
  }
}

const makeSession = (size: number) => {
  const base = new Map<number, Held>()
  const entries: Array<MessageLog.Entry> = []
  const shown = new Set<number>()
  const coalesced = new Map<number, MessageLog.Update>()
  const drop = () => {
    const oldest = entries.shift()!
    shown.delete(oldest.seq)
    if (oldest._tag === "Update" && coalesced.get(oldest.instance) === oldest) {
      coalesced.delete(oldest.instance)
    }
    apply(base, oldest)
  }
  return {
    record: (entry: MessageLog.Entry, excluded = false) => {
      if (excluded && entry._tag === "Update") {
        const replaced = coalesced.get(entry.instance)
        if (replaced !== undefined) {
          entries.splice(entries.lastIndexOf(replaced), 1)
        }
        const merged =
          entry.queries === undefined && replaced?.queries !== undefined
            ? { ...entry, queries: replaced.queries }
            : entry
        entries.push(merged)
        coalesced.set(entry.instance, merged)
        return
      }
      coalesced.clear()
      entries.push(entry)
      shown.add(entry.seq)
      while (shown.size > size) drop()
    },
    clear: (upTo: number) => {
      while (entries.length > 0 && entries[0]!.seq <= upTo) drop()
    },
    holds: (seq: number) => shown.has(seq),
    at: (seq: number): State => {
      const states = new Map(base)
      for (const entry of entries) {
        if (entry.seq > seq) break
        apply(states, entry)
      }
      const byPath = new Map<string, BrowserHost.Recorded>()
      for (const instance of Array.from(states.keys()).sort((a, b) => a - b)) {
        const { path, ...recorded } = states.get(instance)!
        byPath.set(path, recorded)
      }
      return (path) => byPath.get(path)
    }
  }
}

export const make = (size: number): History => {
  const sessions = new Map<string, ReturnType<typeof makeSession>>()
  return {
    record: (entry, excluded) => {
      let session = sessions.get(entry.session)
      if (session === undefined) {
        sessions.set(entry.session, session = makeSession(size))
      }
      session.record(entry, excluded)
    },
    clear: (session, upTo) => {
      sessions.get(session)?.clear(upTo)
    },
    holds: (session, seq) => sessions.get(session)?.holds(seq) ?? false,
    at: (session, seq) => {
      const held = sessions.get(session)
      return held === undefined || !held.holds(seq) ? undefined : held.at(seq)
    }
  }
}
