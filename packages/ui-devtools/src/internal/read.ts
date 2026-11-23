import * as MessageLog from "@effect/ui/MessageLog"
import type * as Schema from "effect/Schema"
import * as Inspector from "../Inspector.ts"

export type Entry = MessageLog.WireEntry
type UpdateEntry = Extract<Entry, { readonly _tag: "Update" }>
type IssuingEntry = Extract<Entry, { readonly _tag: "Update" | "Mounted" }>
type RunEntry = Extract<
  Entry,
  { readonly _tag: "CommandStarted" | "CommandEnded" | "CommandInterrupted" | "CommandAwaiting" | "CommandDropped" }
>

export type Tone = "plain" | "ok" | "bad" | "open" | "muted"

export type Filter = "all" | "updates" | "commands" | "lifecycle"

const updateTags: ReadonlySet<string> = new Set(["Update", "Failed", "PropsChanged", "QueryChanged"])
const commandTags: ReadonlySet<string> = new Set([
  "CommandStarted",
  "CommandAwaiting",
  "CommandEnded",
  "CommandInterrupted",
  "CommandDropped",
  "SendDropped"
])

export const matches = (entry: Entry, filter: Filter, instance: number | null): boolean => {
  if (instance !== null && (!("instance" in entry) || entry.instance !== instance)) return false
  switch (filter) {
    case "all":
      return true
    case "updates":
      return updateTags.has(entry._tag)
    case "commands":
      return commandTags.has(entry._tag) || isIssuing(entry) && entry.commands.length > 0
    case "lifecycle":
      return !updateTags.has(entry._tag) && !commandTags.has(entry._tag)
  }
}

export const isIssuing = (entry: Entry | Inspector.Outside): entry is IssuingEntry =>
  entry._tag === "Update" || entry._tag === "Mounted"

export const isRun = (entry: Entry | Inspector.Outside): entry is RunEntry =>
  entry._tag === "CommandStarted" || entry._tag === "CommandEnded" || entry._tag === "CommandInterrupted" ||
  entry._tag === "CommandAwaiting" || entry._tag === "CommandDropped"

export const tagOf = (value: Schema.Json): string | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const tag = (value as Schema.JsonObject)._tag
  return typeof tag === "string" ? tag : undefined
}

export const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1) || path

export const depthOf = (path: string): number => Math.max(0, path.split("/").length - 2)

export interface Glyph {
  readonly glyph: string
  readonly tone: Tone
}

const glyph = (glyph: string, tone: Tone = "plain"): Glyph => ({ glyph, tone })

export const glyphOf = (entry: Entry, changed: Inspector.Previous["changed"] | undefined): Glyph => {
  switch (entry._tag) {
    case "Update":
    case "Waiting":
    case "PropsChanged":
      return changed === true ? glyph("~") : glyph(" ")
    case "Mounted":
      return glyph("●")
    case "Unmounted":
      return glyph("⏏")
    case "LayerPending":
    case "CommandAwaiting":
      return glyph("◌", "open")
    case "LayerReady":
    case "CommandEnded":
      return glyph("✓", "ok")
    case "MountEnded":
      return entry.reason === "completed" ? glyph("✓", "ok") : entry.reason === "failed" ? glyph("×", "bad") : glyph("■")
    case "SubscriptionStarted":
    case "MountStarted":
    case "CommandStarted":
      return glyph("▶")
    case "SubscriptionStopped":
      return glyph("■")
    case "LayerFailed":
    case "Failed":
    case "CommandInterrupted":
    case "CommandDropped":
    case "SendDropped":
      return glyph("×", "bad")
    default:
      return glyph(" ")
  }
}

export interface Label {
  readonly text: string
  readonly detail?: string | undefined
  readonly commands?: number | undefined
}

export const labelOf = (entry: Entry): Label => {
  switch (entry._tag) {
    case "Update":
      return {
        text: tagOf(entry.message) ?? "Update",
        commands: entry.commands.length || undefined
      }
    case "Mounted":
      return { text: "Mounted", commands: entry.commands.length || undefined }
    case "SessionStarted":
      return { text: "SessionStarted", detail: entry.app }
    case "FetchStarted":
      return { text: "FetchStarted", detail: entry.query }
    case "QueryChanged":
      return { text: "QueryChanged", detail: entry.name }
    case "Failed":
      return { text: "Failed", detail: entry.in }
    case "SubscriptionStarted":
    case "SubscriptionStopped":
      return { text: entry._tag, detail: subscriptionText(entry) }
    case "MountStarted":
    case "MountEnded":
    case "CommandStarted":
    case "CommandAwaiting":
    case "CommandEnded":
    case "CommandDropped":
      return { text: entry._tag, detail: entry.name }
    case "CommandInterrupted":
      return { text: entry._tag, detail: entry.name + " · " + entry.reason }
    case "SendDropped":
      return { text: entry._tag, detail: entry.owner }
    default:
      return { text: entry._tag }
  }
}

export const subscriptionText = (
  subscription: { readonly name: string; readonly deps: ReadonlyArray<Schema.Json> | null }
): string => subscription.deps === null ? subscription.name : subscription.name + " " + JSON.stringify(subscription.deps)

export const instanceOf = (entry: Entry | Inspector.Outside): number | undefined =>
  "instance" in entry ? entry.instance : undefined

export interface Badge {
  readonly glyph: string
  readonly text: string
  readonly tone: Tone
}

const plural = (count: number, one: string, many: string) => count + " " + (count === 1 ? one : many)

export const badgesOf = (session: Inspector.Session, instance: Inspector.Instance): ReadonlyArray<Badge> => {
  const ended = new Map<string, number>()
  let running = 0
  let waiting = 0
  for (const record of session.records(instance.instance)) {
    if (record.kind !== "command") continue
    if (record.end === undefined) {
      if (record.start === undefined) waiting++
      else running++
      continue
    }
    const reason = record.reason ?? "ended"
    ended.set(reason, (ended.get(reason) ?? 0) + 1)
  }
  const badges: Array<Badge> = []
  for (const [reason, count] of ended) {
    if (reason === "ended") badges.push({ glyph: "✓", text: plural(count, "command ended", "commands ended"), tone: "ok" })
    else if (reason === "server") badges.push({ glyph: "×", text: count + " dropped on the server", tone: "bad" })
    else {
      badges.push({
        glyph: "×",
        text: count + " interrupted" + (reason === "interrupt" ? "" : " · " + reason),
        tone: "bad"
      })
    }
  }
  if (running > 0) badges.push({ glyph: "◌", text: count(running, "running"), tone: "open" })
  if (waiting > 0) badges.push({ glyph: "◌", text: count(waiting, "not started"), tone: "open" })
  if (instance.unmounted !== undefined) badges.push({ glyph: "⏏", text: "unmounted", tone: "bad" })
  if (badges.length === 0) badges.push({ glyph: "", text: "idle", tone: "muted" })
  return badges
}

const count = (n: number, text: string) => n + " " + text

export interface Ref {
  readonly seq: number
  readonly entry: Entry | Inspector.Outside
}

export const refOf = (session: Inspector.Session, seq: number): Ref => ({ seq, entry: session.resolve(seq) })

export const summaryOf = (entry: Entry | Inspector.Outside): string => {
  if (entry._tag === "Outside") return "outside the buffer"
  const label = labelOf(entry)
  return entry._tag === "Update" ? "Update " + label.text : label.detail === undefined ? label.text : label.text + " " + label.detail
}

export type Step =
  | { readonly _tag: "Source"; readonly source: UpdateEntry["source"]; readonly link: Ref | undefined }
  | { readonly _tag: "Link"; readonly what: string; readonly ref: Ref }
  | { readonly _tag: "Entry"; readonly ref: Ref; readonly selected: boolean }
  | {
    readonly _tag: "Command"
    readonly index: number
    readonly command: IssuingEntry["commands"][number]
    readonly stopped: ReadonlyArray<Ref>
  }
  | { readonly _tag: "Started"; readonly ref: Ref; readonly selected: boolean }
  | { readonly _tag: "NotStarted"; readonly ended: boolean }
  | { readonly _tag: "End"; readonly ref: Ref; readonly selected: boolean; readonly after: number | undefined }
  | { readonly _tag: "Running"; readonly since: Ref | undefined }
  | { readonly _tag: "Result"; readonly ref: Ref }
  | { readonly _tag: "CausedBy"; readonly ref: Ref }
  | { readonly _tag: "Names"; readonly links: ReadonlyArray<Inspector.Link & { readonly entry: Entry | Inspector.Outside }> }

const sourceLink = (session: Inspector.Session, seq: number): Ref | undefined => {
  const link = session.back(seq).find((link) => link.rel === "source")
  return link === undefined ? undefined : refOf(session, link.seq)
}

const runSteps = (
  session: Inspector.Session,
  issuing: IssuingEntry,
  index: number,
  selected: number
): Array<Step> => {
  const steps: Array<Step> = []
  const run = session.run({ seq: issuing.seq, index })
  if (run === undefined) return steps
  if (run.start !== undefined) {
    steps.push({ _tag: "Started", ref: refOf(session, run.start), selected: run.start === selected })
  } else steps.push({ _tag: "NotStarted", ended: run.end !== undefined })
  for (const link of session.forward(issuing.seq)) {
    if (link.rel === "source" && link.index === index) steps.push({ _tag: "Result", ref: refOf(session, link.seq) })
  }
  if (run.end === undefined) {
    steps.push({ _tag: "Running", since: run.start === undefined ? undefined : refOf(session, run.start) })
    return steps
  }
  const end = refOf(session, run.end)
  steps.push({
    _tag: "End",
    ref: end,
    selected: run.end === selected,
    after: end.entry._tag === "Outside" ? undefined : end.entry.at - issuing.at
  })
  if (end.entry._tag === "CommandInterrupted" && end.entry.causedBy !== undefined) {
    steps.push({ _tag: "CausedBy", ref: refOf(session, end.entry.causedBy) })
  }
  return steps
}

const issuingSteps = (session: Inspector.Session, issuing: IssuingEntry, selected: number, only?: number) => {
  const steps: Array<Step> = []
  if (issuing._tag === "Update") {
    steps.push({ _tag: "Source", source: issuing.source, link: sourceLink(session, issuing.seq) })
  } else if (issuing.causedBy !== undefined) {
    steps.push({ _tag: "Link", what: "causedBy", ref: refOf(session, issuing.causedBy) })
  }
  steps.push({ _tag: "Entry", ref: { seq: issuing.seq, entry: issuing }, selected: issuing.seq === selected })
  const stopped = session.forward(issuing.seq).filter((link) => link.rel === "causedBy").map((link) =>
    refOf(session, link.seq)
  ).filter((ref) => ref.entry._tag === "CommandInterrupted")
  issuing.commands.forEach((command, index) => {
    if (only !== undefined && index !== only) return
    if (command._tag === "Interrupt") {
      steps.push({
        _tag: "Command",
        index,
        command,
        stopped: stopped.filter((ref) =>
          ref.entry._tag === "CommandInterrupted" && ref.entry.name === command.name
        )
      })
      return
    }
    steps.push({ _tag: "Command", index, command, stopped: [] })
    steps.push(...runSteps(session, issuing, index, selected))
  })
  return steps
}

export const chainOf = (session: Inspector.Session, entry: Entry): ReadonlyArray<Step> => {
  if (isIssuing(entry)) return issuingSteps(session, entry, entry.seq)
  if (isRun(entry)) {
    const issuing = session.resolve(entry.issued.seq)
    if (isIssuing(issuing)) {
      const steps = issuingSteps(session, issuing, entry.seq, entry.issued.index)
      if (entry._tag === "CommandAwaiting" || entry._tag === "CommandDropped") {
        steps.push({ _tag: "Entry", ref: { seq: entry.seq, entry }, selected: true })
      }
      return steps
    }
    return [
      { _tag: "Link", what: "issued by", ref: refOf(session, entry.issued.seq) },
      { _tag: "Entry", ref: { seq: entry.seq, entry }, selected: true }
    ]
  }
  const steps: Array<Step> = []
  for (const link of session.back(entry.seq)) {
    steps.push({ _tag: "Link", what: link.rel, ref: refOf(session, link.seq) })
  }
  steps.push({ _tag: "Entry", ref: { seq: entry.seq, entry }, selected: true })
  const named = session.forward(entry.seq).map((link) => ({ ...link, entry: session.resolve(link.seq) }))
  if (named.length > 0) steps.push({ _tag: "Names", links: named })
  return steps
}

export const chainSeqs = (steps: ReadonlyArray<Step>): ReadonlySet<number> => {
  const seqs = new Set<number>()
  for (const step of steps) {
    switch (step._tag) {
      case "Source":
        if (step.link !== undefined) seqs.add(step.link.seq)
        break
      case "Link":
      case "Entry":
      case "Started":
      case "End":
      case "Result":
      case "CausedBy":
        seqs.add(step.ref.seq)
        break
      case "Command":
        for (const ref of step.stopped) seqs.add(ref.seq)
        break
    }
  }
  return seqs
}

export interface Row {
  readonly depth: number
  readonly key: string | number | undefined
  readonly value: Schema.Json | undefined
  readonly open?: "{" | "[" | undefined
  readonly close?: "}" | "]" | undefined
  readonly change?: Inspector.Change | undefined
}

const pathKey = (path: ReadonlyArray<string | number>) => JSON.stringify(path)

const isBranch = (value: Schema.Json): value is Schema.JsonObject | ReadonlyArray<Schema.Json> =>
  typeof value === "object" && value !== null && !MessageLog.isPlaceholder(value)

export const treeOf = (value: Schema.Json, changes: ReadonlyArray<Inspector.Change>): ReadonlyArray<Row> => {
  const byPath = new Map<string, Inspector.Change>()
  const removedUnder = new Map<string, Array<Inspector.Change>>()
  for (const change of changes) {
    byPath.set(pathKey(change.path), change)
    if (change.kind === "removed") {
      const parent = pathKey(change.path.slice(0, -1))
      const list = removedUnder.get(parent) ?? []
      list.push(change)
      removedUnder.set(parent, list)
    }
  }
  const rows: Array<Row> = []
  const visit = (value: Schema.Json, key: string | number | undefined, path: Array<string | number>, depth: number) => {
    const change = byPath.get(pathKey(path))
    if (!isBranch(value) || change !== undefined && change.kind !== "unknown") {
      rows.push({ depth, key, value, change })
      return
    }
    const array = Array.isArray(value)
    if (depth > 0 || key !== undefined) rows.push({ depth, key, value: undefined, open: array ? "[" : "{" })
    const inner = depth > 0 || key !== undefined ? depth + 1 : depth
    if (array) {
      value.forEach((item, index) => visit(item, index, [...path, index], inner))
    } else {
      for (const [name, item] of Object.entries(value)) visit(item, name, [...path, name], inner)
    }
    for (const removed of removedUnder.get(pathKey(path)) ?? []) {
      rows.push({ depth: inner, key: removed.path[removed.path.length - 1], value: removed.before, change: removed })
    }
    if (depth > 0 || key !== undefined) rows.push({ depth, key: undefined, value: undefined, close: array ? "]" : "}" })
  }
  visit(value, undefined, [], 0)
  return rows
}

export const sameJson = (a: Schema.Json, b: Schema.Json): boolean =>
  Inspector.diff(a, b).every((change) => change.kind === "unknown")

export interface Lifecycle {
  readonly instance: Inspector.Instance
  readonly records: ReadonlyArray<Inspector.Record>
}

export const lifecycleOf = (session: Inspector.Session, instance: number): Lifecycle | undefined => {
  const info = session.instances().find((candidate) => candidate.instance === instance)
  return info === undefined ? undefined : { instance: info, records: session.records(instance) }
}
