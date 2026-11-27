import * as MessageLog from "@effect/ui/MessageLog"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import type * as Inspector from "../Inspector.ts"

export type Entry = MessageLog.WireEntry
type UpdateEntry = Extract<Entry, { readonly _tag: "Update" }>
export type Source = UpdateEntry["source"]
type IssuingEntry = Extract<Entry, { readonly _tag: "Update" | "Mounted" }>
type RunEntry = Extract<
  Entry,
  {
    readonly _tag:
      | "CommandStarted"
      | "CommandEnded"
      | "CommandInterrupted"
      | "CommandAwaiting"
      | "CommandDropped"
  }
>

export type Tone = "bad" | "open"

export type Filter = "messages" | "commands" | "all"

const updateTags: ReadonlySet<string> = new Set([
  "Update",
  "Failed",
  "PropsChanged",
  "QueryChanged"
])
const commandTags: ReadonlySet<string> = new Set([
  "CommandStarted",
  "CommandAwaiting",
  "CommandEnded",
  "CommandInterrupted",
  "CommandDropped",
  "SendDropped"
])
const instanceTags: ReadonlySet<string> = new Set([
  "Mounted",
  "Unmounted",
  "Waiting"
])

export const matches = (entry: Entry, filter: Filter): boolean => {
  switch (filter) {
    case "all":
      return true
    case "messages":
      return updateTags.has(entry._tag) || commandTags.has(entry._tag) ||
        instanceTags.has(entry._tag)
    case "commands":
      return commandTags.has(entry._tag) ||
        isIssuing(entry) && entry.commands.length > 0 ||
        issuedOf(entry) !== undefined
  }
}

export const isIssuing = (
  entry: Entry | Inspector.Outside
): entry is IssuingEntry => entry._tag === "Update" || entry._tag === "Mounted"

export const isRun = (entry: Entry | Inspector.Outside): entry is RunEntry =>
  entry._tag === "CommandStarted" || entry._tag === "CommandEnded" ||
  entry._tag === "CommandInterrupted" ||
  entry._tag === "CommandAwaiting" || entry._tag === "CommandDropped"

export const issuedOf = (
  entry: Entry | Inspector.Outside
): MessageLog.Issued | undefined =>
  isRun(entry)
    ? entry.issued
    : entry._tag === "Failed"
    ? entry.issued
    : undefined

export const Field = Schema.Struct({
  name: Schema.NonEmptyString,
  value: Schema.Union([Schema.String, Schema.Number, Schema.Boolean])
})

export type Field = typeof Field.Type

export const fieldNames = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value)
    ? Array.from(
      new Set(
        value.filter((name): name is string =>
          typeof name === "string" && name !== ""
        )
      )
    )
    : []

const commandOf = (session: Inspector.Session, issued: MessageLog.Issued) => {
  const issuing = session.resolve(issued.seq)
  return isIssuing(issuing) ? issuing.commands[issued.index] : undefined
}

const payloadOf = (session: Inspector.Session, entry: Entry): unknown => {
  if (entry._tag === "Update") return entry.message
  if (entry._tag === "Failed" && entry.update !== undefined) {
    return entry.update.message
  }
  const issued = issuedOf(entry)
  return issued && commandOf(session, issued)?.args
}

const valueOf = (
  payload: unknown,
  name: string
): Field["value"] | undefined => {
  if (
    !Predicate.isObject(payload) || !Object.hasOwn(payload, name) ||
    MessageLog.isPlaceholder(payload)
  ) return undefined
  const value = payload[name]
  return typeof value === "string" || typeof value === "number" ||
      typeof value === "boolean"
    ? value
    : undefined
}

export const fieldsOf = (
  session: Inspector.Session,
  entry: Entry,
  names: ReadonlyArray<string>
): ReadonlyArray<Field> => {
  if (names.length === 0) return []
  const payload = payloadOf(session, entry)
  return names.flatMap((name) => {
    const value = valueOf(payload, name)
    return value === undefined ? [] : [{ name, value }]
  })
}

export const hasField = (
  session: Inspector.Session,
  entry: Entry,
  field: Field
): boolean => valueOf(payloadOf(session, entry), field.name) === field.value

export const tagOf = (value: unknown): string | undefined =>
  Predicate.hasProperty(value, "_tag") && typeof value._tag === "string"
    ? value._tag
    : undefined

export const nameOf = (path: string): string => {
  const boundary = path.lastIndexOf("]/")
  if (boundary !== -1) return path.slice(boundary + 2)
  const bracket = path.indexOf("[")
  return bracket === -1
    ? path.slice(1)
    : path.slice(path.lastIndexOf("/", bracket) + 1)
}

export interface Label {
  readonly text: string
  readonly detail?: string | undefined
  readonly tone?: Tone | undefined
}

export const labelOf = (entry: Entry): Label => {
  switch (entry._tag) {
    case "Update":
      return { text: tagOf(entry.message) ?? "Update" }
    case "SessionStarted":
      return { text: "SessionStarted", detail: entry.app }
    case "FetchStarted":
      return { text: "FetchStarted", detail: entry.query }
    case "QueryChanged":
      return { text: "QueryChanged", detail: entry.name }
    case "Failed":
      return {
        text: "Failed",
        detail: entry.name === undefined
          ? entry.in
          : entry.in + " " + entry.name,
        tone: "bad"
      }
    case "LayerFailed":
      return { text: "LayerFailed", tone: "bad" }
    case "SubscriptionStarted":
    case "SubscriptionStopped":
      return { text: entry._tag, detail: subscriptionText(entry) }
    case "MountStarted":
      return { text: "MountStarted", detail: entry.name }
    case "MountEnded":
      return {
        text: "MountEnded",
        detail: entry.name,
        tone: entry.reason === "failed" ? "bad" : undefined
      }
    case "CommandStarted":
      return { text: entry.name, detail: "started" }
    case "CommandAwaiting":
      return { text: entry.name, detail: "waiting", tone: "open" }
    case "CommandEnded":
      return { text: entry.name, detail: reasonText.ended }
    case "CommandInterrupted":
      return { text: entry.name, detail: reasonText[entry.reason], tone: "bad" }
    case "CommandDropped":
      return { text: entry.name, detail: reasonText.server, tone: "bad" }
    case "SendDropped":
      return { text: "SendDropped", detail: entry.owner, tone: "bad" }
    default:
      return { text: entry._tag }
  }
}

export const rowOf = (session: Inspector.Session, entry: Entry): Label => {
  const label = labelOf(entry)
  if (entry._tag !== "CommandStarted") return label
  const run = session.run(entry.issued)
  return run !== undefined && run.end === undefined
    ? { ...label, detail: "running", tone: "open" }
    : label
}

export const subscriptionText = (
  subscription: {
    readonly name: string
    readonly deps: ReadonlyArray<Schema.Json> | null
  }
): string =>
  subscription.deps === null
    ? subscription.name
    : subscription.name + " " + JSON.stringify(subscription.deps)

export const instanceOf = (
  entry: Entry | Inspector.Outside
): number | undefined => "instance" in entry ? entry.instance : undefined

export interface Status {
  readonly text: string
  readonly tone?: Tone | undefined
}

export const statusesOf = (
  summary: Inspector.Summary
): ReadonlyArray<Status> => {
  const statuses: Array<Status> = []
  for (const { count, reason } of summary.ended) {
    statuses.push({
      text: count + " " + reasonText[reason],
      tone: reasonTone[reason] === "bad" ? "bad" : undefined
    })
  }
  if (summary.running > 0) {
    statuses.push({ text: summary.running + " running", tone: "open" })
  }
  if (summary.waiting > 0) {
    statuses.push({ text: summary.waiting + " waiting", tone: "open" })
  }
  if (summary.unmounted !== undefined) {
    statuses.push({ text: "unmounted", tone: "bad" })
  }
  return statuses
}

export const toneOf = (summary: Inspector.Summary): Tone | undefined =>
  summary.ended.some(({ reason }) => reasonTone[reason] === "bad")
    ? "bad"
    : summary.running + summary.waiting > 0
    ? "open"
    : undefined

export const duration = (ms: number): string =>
  ms < 1000 ? Math.round(ms) + " ms" : (ms / 1000).toFixed(1) + " s"

export const position = (ms: number): string => {
  if (ms < 1000) return duration(ms)
  const total = Math.round(ms)
  const minutes = Math.floor(total / 60_000)
  const seconds = Math.floor(total / 1000) % 60
  return minutes + ":" + String(seconds).padStart(2, "0") + "." +
    String(total % 1000).padStart(3, "0")
}

export type Mark =
  | "message"
  | "issue"
  | "start"
  | "end"
  | "bad"
  | "mount"
  | "unmount"
  | "ring"

export const markOf = (entry: Entry | Inspector.Outside): Mark => {
  if (entry._tag !== "Outside" && isFailure(entry)) return "bad"
  switch (entry._tag) {
    case "Update":
      return "message"
    case "CommandStarted":
    case "CommandAwaiting":
      return "start"
    case "CommandEnded":
      return "end"
    case "CommandInterrupted":
    case "CommandDropped":
    case "SendDropped":
      return "bad"
    case "Mounted":
      return "mount"
    case "Unmounted":
      return "unmount"
    default:
      return "ring"
  }
}

export const isFailure = (entry: MessageLog.Entry | Entry): boolean =>
  entry._tag === "Failed" || entry._tag === "LayerFailed" ||
  entry._tag === "MountEnded" && entry.reason === "failed"

export interface Ref {
  readonly seq: number
  readonly entry: Entry | Inspector.Outside
}

export const refOf = (session: Inspector.Session, seq: number): Ref => ({
  seq,
  entry: session.resolve(seq)
})

export const summaryOf = (entry: Entry | Inspector.Outside): string => {
  if (entry._tag === "Outside") return "outside the buffer"
  const label = labelOf(entry)
  return entry._tag === "Update"
    ? "Update " + label.text
    : [label.text, label.detail].filter(Boolean).join(" ")
}

export type Step =
  | {
    readonly _tag: "Source"
    readonly source: Source
    readonly link: Ref | undefined
  }
  | {
    readonly _tag: "Link"
    readonly rel: Inspector.Link["rel"]
    readonly ref: Ref
  }
  | {
    readonly _tag: "Entry"
    readonly ref: Ref
    readonly selected: boolean
    readonly stopped?: ReadonlyArray<Ref> | undefined
  }
  | {
    readonly _tag: "Command"
    readonly index: number
    readonly command: IssuingEntry["commands"][number]
    readonly stopped: ReadonlyArray<Ref>
  }
  | { readonly _tag: "Started"; readonly ref: Ref; readonly selected: boolean }
  | { readonly _tag: "NotStarted"; readonly ended: boolean }
  | {
    readonly _tag: "End"
    readonly ref: Ref
    readonly selected: boolean
    readonly after: number | undefined
  }
  | { readonly _tag: "Running"; readonly since: Ref | undefined }
  | { readonly _tag: "Result"; readonly ref: Ref }
  | { readonly _tag: "CausedBy"; readonly ref: Ref }
  | {
    readonly _tag: "Names"
    readonly links: ReadonlyArray<
      Inspector.Link & { readonly entry: Entry | Inspector.Outside }
    >
  }

const sourceLink = (
  session: Inspector.Session,
  seq: number
): Ref | undefined => {
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
    steps.push({
      _tag: "Started",
      ref: refOf(session, run.start),
      selected: run.start === selected
    })
  } else steps.push({ _tag: "NotStarted", ended: run.end !== undefined })
  for (const link of session.forward(issuing.seq)) {
    if (link.rel === "source" && link.index === index) {
      steps.push({ _tag: "Result", ref: refOf(session, link.seq) })
    }
  }
  if (run.end === undefined) {
    steps.push({
      _tag: "Running",
      since: run.start === undefined ? undefined : refOf(session, run.start)
    })
    return steps
  }
  const end = refOf(session, run.end)
  steps.push({
    _tag: "End",
    ref: end,
    selected: run.end === selected,
    after: end.entry._tag === "Outside" ? undefined : end.entry.at - issuing.at
  })
  if (
    end.entry._tag === "CommandInterrupted" && end.entry.causedBy !== undefined
  ) {
    steps.push({ _tag: "CausedBy", ref: refOf(session, end.entry.causedBy) })
  }
  return steps
}

const stoppedBy = (session: Inspector.Session, issuing: IssuingEntry) => {
  const byCommand = new Map<number, Array<Ref>>()
  const unattributed: Array<Ref> = []
  for (const link of session.forward(issuing.seq)) {
    if (link.rel !== "causedBy") continue
    const ref = refOf(session, link.seq)
    const end = ref.entry
    if (end._tag !== "CommandInterrupted") continue
    const group = commandOf(session, end.issued)?.group
    const candidates = end.reason !== "interrupt" ?
      [] :
      issuing.commands.flatMap((command, index) =>
        command._tag === "Interrupt" && command.name === end.name &&
          (group === undefined || command.group === null ||
            command.group === group)
          ? [index]
          : []
      )
    if (candidates.length === 1) {
      const list = byCommand.get(candidates[0]!) ?? []
      list.push(ref)
      byCommand.set(candidates[0]!, list)
    } else unattributed.push(ref)
  }
  return { byCommand, unattributed }
}

const issuingSteps = (
  session: Inspector.Session,
  issuing: IssuingEntry,
  selected: number,
  only?: number
) => {
  const steps: Array<Step> = []
  if (issuing._tag === "Update") {
    steps.push({
      _tag: "Source",
      source: issuing.source,
      link: sourceLink(session, issuing.seq)
    })
  } else if (issuing.causedBy !== undefined) {
    steps.push({
      _tag: "Link",
      rel: "causedBy",
      ref: refOf(session, issuing.causedBy)
    })
  }
  const { byCommand, unattributed } = stoppedBy(session, issuing)
  steps.push({
    _tag: "Entry",
    ref: { seq: issuing.seq, entry: issuing },
    selected: issuing.seq === selected,
    stopped: unattributed
  })
  issuing.commands.forEach((command, index) => {
    if (only !== undefined && index !== only) return
    if (command._tag === "Interrupt") {
      steps.push({
        _tag: "Command",
        index,
        command,
        stopped: byCommand.get(index) ?? []
      })
      return
    }
    steps.push({ _tag: "Command", index, command, stopped: [] })
    steps.push(...runSteps(session, issuing, index, selected))
  })
  return steps
}

export const chainOf = (
  session: Inspector.Session,
  entry: Entry
): ReadonlyArray<Step> => {
  if (isIssuing(entry)) return issuingSteps(session, entry, entry.seq)
  const issued = issuedOf(entry)
  if (issued !== undefined) {
    const issuing = session.resolve(issued.seq)
    if (isIssuing(issuing)) {
      const steps = issuingSteps(session, issuing, entry.seq, issued.index)
      if (entry._tag === "CommandAwaiting" || entry._tag === "CommandDropped") {
        steps.push({
          _tag: "Entry",
          ref: { seq: entry.seq, entry },
          selected: true
        })
      }
      return steps
    }
  }
  const steps: Array<Step> = []
  for (const link of session.back(entry.seq)) {
    steps.push({ _tag: "Link", rel: link.rel, ref: refOf(session, link.seq) })
  }
  steps.push({ _tag: "Entry", ref: { seq: entry.seq, entry }, selected: true })
  const named = session.forward(entry.seq).map((link) => ({
    ...link,
    entry: session.resolve(link.seq)
  }))
  if (named.length > 0) steps.push({ _tag: "Names", links: named })
  return steps
}

export const inRun = (step: Step): boolean =>
  step._tag === "Command"
    ? step.command._tag !== "Interrupt"
    : step._tag === "Started" || step._tag === "NotStarted" ||
      step._tag === "Result"

export const chainSeqs = (steps: ReadonlyArray<Step>): ReadonlySet<number> => {
  const seqs = new Set<number>()
  for (const step of steps) {
    switch (step._tag) {
      case "Source":
        if (step.link !== undefined) seqs.add(step.link.seq)
        break
      case "Entry":
        seqs.add(step.ref.seq)
        for (const ref of step.stopped ?? []) seqs.add(ref.seq)
        break
      case "Link":
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
  readonly id: string
  readonly depth: number
  readonly key: string | number | undefined
  readonly value: Schema.Json | undefined
  readonly open?: "{" | "[" | undefined
  readonly close?: "}" | "]" | undefined
  readonly change?: Inspector.Change | undefined
  readonly branch?: Branch | undefined
}

export interface Branch {
  readonly path: string
  readonly expanded: boolean
  readonly preview: string
  readonly changes: number
}

const pathKey = (path: ReadonlyArray<string | number>) => JSON.stringify(path)

const isBranch = (
  value: Schema.Json
): value is Schema.JsonObject | ReadonlyArray<Schema.Json> =>
  typeof value === "object" && value !== null &&
  !MessageLog.isPlaceholder(value)

const previewKeys = 3

const previewOf = (
  value: Schema.JsonObject | ReadonlyArray<Schema.Json>
): string => {
  if (Array.isArray(value)) {
    return "[ " + value.length + (value.length === 1 ? " item ]" : " items ]")
  }
  const tag = tagOf(value)
  const prefix = tag === undefined ? "" : tag + " "
  const keys = Object.keys(value).filter((key) => key !== "_tag")
  if (keys.length === 0) return prefix + "{}"
  return prefix + "{ " + keys.slice(0, previewKeys).join(", ") +
    (keys.length > previewKeys ? ", … }" : " }")
}

export const treeOf = (
  value: Schema.Json,
  changes: ReadonlyArray<Inspector.Change>,
  expanded?: ReadonlySet<string>
): ReadonlyArray<Row> => {
  const byPath = new Map<string, Inspector.Change>()
  const removedUnder = new Map<string, Array<Inspector.Change>>()
  const changesUnder = new Map<string, number>()
  for (const change of changes) {
    byPath.set(pathKey(change.path), change)
    if (change.kind === "removed") {
      const parent = pathKey(change.path.slice(0, -1))
      const list = removedUnder.get(parent) ?? []
      list.push(change)
      removedUnder.set(parent, list)
    }
    if (change.kind !== "unknown") {
      for (let length = 1; length < change.path.length; length++) {
        const ancestor = pathKey(change.path.slice(0, length))
        changesUnder.set(ancestor, (changesUnder.get(ancestor) ?? 0) + 1)
      }
    }
  }
  const rows: Array<Row> = []
  const visit = (
    value: Schema.Json,
    key: string | number | undefined,
    path: Array<string | number>,
    depth: number
  ) => {
    const id = pathKey(path)
    const found = byPath.get(id)
    const change = found?.kind === "unknown" ? undefined : found
    const nested = depth > 0 || key !== undefined
    const hidden = changesUnder.get(id) ?? 0
    if (
      !isBranch(value) ||
      change !== undefined &&
        (expanded === undefined || change.kind === "changed") ||
      expanded !== undefined && nested && hidden === 0 &&
        Object.keys(value).length === 0
    ) {
      rows.push({ id, depth, key, value, change })
      return
    }
    const array = Array.isArray(value)
    if (nested) {
      const open = expanded?.has(id) ?? true
      rows.push({
        id: id + "{",
        depth,
        key,
        value: undefined,
        open: array ? "[" : "{",
        change,
        branch: expanded &&
          {
            path: id,
            expanded: open,
            preview: previewOf(value),
            changes: hidden
          }
      })
      if (!open) return
    }
    const inner = nested ? depth + 1 : depth
    if (array) {
      value.forEach((item, index) =>
        visit(item, index, [...path, index], inner)
      )
    } else {
      for (const [name, item] of Object.entries(value)) {
        visit(item, name, [...path, name], inner)
      }
    }
    for (const removed of removedUnder.get(id) ?? []) {
      visit(removed.before!, removed.path[removed.path.length - 1], [
        ...removed.path
      ], inner)
    }
    if (nested) {
      rows.push({
        id: id + "}",
        depth,
        key: undefined,
        value: undefined,
        close: array ? "]" : "}"
      })
    }
  }
  visit(value, undefined, [], 0)
  return rows
}

export const statusOf = (
  changes: ReadonlyArray<Inspector.Change>
): "same" | "changed" | "unknown" =>
  changes.length === 0
    ? "same"
    : changes.some((change) => change.kind !== "unknown")
    ? "changed"
    : "unknown"

export const reasonText: { readonly [R in Inspector.Reason]: string } = {
  ended: "ended",
  completed: "completed",
  closed: "closed",
  ready: "ready",
  stopped: "stopped",
  failed: "failed",
  server: "dropped on the server",
  interrupt: "interrupted",
  switch: "interrupted (switch)",
  unmount: "interrupted (unmount)",
  layer: "interrupted (layer)",
  self: "interrupted (self)"
}

export const reasonTone: { readonly [R in Inspector.Reason]: "ok" | "bad" } = {
  ended: "ok",
  completed: "ok",
  closed: "ok",
  ready: "ok",
  stopped: "ok",
  failed: "bad",
  server: "bad",
  interrupt: "bad",
  switch: "bad",
  unmount: "bad",
  layer: "bad",
  self: "bad"
}
