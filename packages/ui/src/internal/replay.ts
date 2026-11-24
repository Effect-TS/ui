/**
 * Replay of a logged session: re-runs each logged message through `update`
 * and compares what it produces with what the log recorded.
 *
 * @internal
 */
import * as Cause from "effect/Cause"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import type * as Component from "../Component.ts"
import * as MessageLog from "../MessageLog.ts"
import type { Divergence, Replay } from "../testing/Story.ts"
import type * as View from "../View.ts"
import * as componentQueries from "./queries.ts"
import * as sharedReads from "./shared.ts"
import { serverFailure, type SlotResult } from "./slotStatus.ts"
import * as engine from "./story.ts"

/**
 * What a replay reached beyond its public fields: what the feature slots its view declares read, and
 * the runs `h.isRunning` sees.
 */
interface Reached {
  readonly component: engine.Fields<any, any, any, any>["component"]
  /** `undefined` while the services the slots read are ready. */
  readonly slotStatus: SlotResult | undefined
  readonly running: (name: string, groupKey: string | undefined) => boolean
}
const reachedOf = new WeakMap<object, Reached>()

/**
 * The view at the state a replay reached, rendered as a Scene renders: its headless children and slot
 * content expanded, its feature slots showing `fallback` while the Layer they read, by the logged
 * `boundary`, wasn't ready, and `h.isRunning` true for each run issued and not logged as ended.
 *
 * Only tests call it: a caller-facing view of a replay is a separate API decision.
 *
 * @internal
 */
// oxlint-disable-next-line effect/no-unused-internal
export const viewOf = (
  replay: Replay<any, any, any, any, any>
): View.Node<any, any> => {
  const reached = reachedOf.get(replay)
  if (reached === undefined) throw new Error("viewOf: not a replay")
  return engine.expandedView({
    component: reached.component,
    props: replay.props,
    model: replay.model,
    results: replay.results,
    pending: [],
    emitted: [],
    sent: [],
    interrupted: [],
    loadingMore: [],
    defaultPrevented: false,
    ack: engine.noAck,
    slotStatus: reached.slotStatus,
    running: reached.running
  })
}

// A Layer entry is the provider's, at its own path: the instances whose `boundary` it is read it.
type Layer = Extract<
  MessageLog.Entry | MessageLog.Wire,
  { _tag: "LayerPending" | "LayerReady" | "LayerFailed" }
>
const layerTags: ReadonlySet<string> = new Set([
  "LayerPending",
  "LayerReady",
  "LayerFailed"
])
const isLayer = (entry: { readonly _tag: string }): entry is Layer =>
  layerTags.has(entry._tag)
// The entries about the replayed path: those that carry its state, and those that end one of its runs.
type Ended = Extract<
  MessageLog.Entry | MessageLog.Wire,
  { _tag: "CommandEnded" | "CommandInterrupted" | "CommandDropped" }
>
const ownTags: ReadonlySet<string> = new Set([
  "Update",
  "Mounted",
  "QueryChanged",
  "PropsChanged",
  "CommandEnded",
  "CommandInterrupted",
  "CommandDropped"
])

/** A logged cause back as a Cause: a Wire frame holds its reasons as JSON. */
const causeOf = (entry: Extract<Layer, { _tag: "LayerFailed" }>) => {
  if (entry.redacted === true) return serverFailure()
  if (typeof entry.component !== "string") {
    return (entry as MessageLog.LayerFailed).cause
  }
  const reasons = (entry as Extract<MessageLog.Wire, { _tag: "LayerFailed" }>)
    .cause.reasons as ReadonlyArray<any>
  return Cause.fromReasons(
    reasons.map((reason): Cause.Reason<unknown> =>
      reason._tag === "Fail"
        ? Cause.makeFailReason(reason.error)
        : reason._tag === "Die"
        ? Cause.makeDieReason(reason.defect)
        : Cause.makeInterruptReason(reason.fiberId ?? undefined)
    )
  )
}

const findPlaceholder = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  if (MessageLog.isPlaceholder(value)) return Object.keys(value)[0]
  for (const key of Object.keys(value)) {
    const inner = findPlaceholder((value as any)[key])
    if (inner !== undefined) return inner
  }
  return undefined
}

/**
 * Re-runs a logged session of one component and finds the first divergence.
 * Errors start with `label`, such as `Story.fromLog`.
 *
 * @internal
 */
export const replayLog = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements
>(
  label: string,
  component: Component.Component<Name, Props, Model, Msg, Events, R, V, any>,
  entries: ReadonlyArray<MessageLog.Entry | MessageLog.Wire>,
  options?: { readonly path?: string | undefined }
): Replay<Model, Msg, Events, any, any> => {
  // The entries that carry an instance's state, each with its component.
  type Stateful =
    | MessageLog.Update
    | MessageLog.Mounted
    | MessageLog.QueryChanged
    | MessageLog.PropsChanged
    | Extract<
      MessageLog.Wire,
      { _tag: "Update" | "Mounted" | "QueryChanged" | "PropsChanged" }
    >
  const stateful = entries.filter((entry): entry is Stateful =>
    entry._tag === "Update" || entry._tag === "Mounted" ||
    entry._tag === "QueryChanged" ||
    entry._tag === "PropsChanged"
  )
  const path = options?.path ??
    stateful.find((entry) =>
      (typeof entry.component === "string"
        ? entry.component
        : entry.component.definition.name) ===
        component.definition.name
    )?.path
  if (path === undefined) {
    throw new Error(
      `${label}: the log has no entry for ${component.definition.name}`
    )
  }
  const all = entries.filter((entry): entry is Stateful | Layer | Ended =>
    "path" in entry &&
    (isLayer(entry) || entry.path === path && ownTags.has(entry._tag))
  )
  // The replay starts at the first Model. Props and query results written before it are in that Update's record, or
  // belong to an earlier mount.
  const start = all.findIndex((entry) =>
    (entry._tag === "Update" || entry._tag === "Mounted") && entry.path === path
  )
  if (start === -1) {
    throw new Error(`${label}: the log has no entry for ${path}`)
  }
  const first = all[start] as
    | MessageLog.Update
    | MessageLog.Mounted
    | Extract<MessageLog.Wire, { _tag: "Update" | "Mounted" }>
  const bound = componentQueries.boundOf(component)
  const resultOf = (
    entry:
      | MessageLog.QueryChanged
      | Extract<MessageLog.Wire, { _tag: "QueryChanged" }>
  ) => {
    if (typeof entry.component !== "string") return entry.result
    const schema = bound?.logSchema.fields[entry.name]
    if (schema === undefined) {
      throw new Error(
        `${label}: entry #${entry.seq} (${path}) writes "${entry.name}", which isn't a query`
      )
    }
    return decodeWith(entry, `query "${entry.name}"`, schema, entry.result)
  }

  const decoders = new Map<Schema.Top, (value: unknown) => unknown>()
  const decode = (
    entry: { readonly seq: number },
    field: "props" | "model" | "message" | "events",
    value: unknown
  ): any => decodeWith(entry, field, component[field] as Schema.Top, value)
  function decodeWith(
    entry: { readonly seq: number },
    field: string,
    schema: Schema.Top,
    value: unknown
  ): any {
    let run = decoders.get(schema)
    if (run === undefined) {
      run = Schema.decodeUnknownSync(
        Schema.toCodecJson(schema as Schema.Codec<unknown, unknown>)
      )
      decoders.set(schema, run)
    }
    try {
      return run(value)
    } catch (error) {
      const placeholder = findPlaceholder(value)
      throw new Error(
        `${label}: entry #${entry.seq} (${path}) has a ${field} that can't be decoded${
          placeholder === undefined
            ? ""
            : `, because it was logged as a ${placeholder} placeholder`
        }: ${String(error)}`,
        { cause: error }
      )
    }
  }
  const reads = sharedReads.readsOf(component.definition)
  const sharedOf = (
    wire: Extract<MessageLog.Wire, { _tag: "Update" }>
  ): Component.SharedRecord | undefined => {
    const encoded = wire.shared as
      | { readonly [name: string]: unknown }
      | undefined
    if (encoded === undefined) return undefined
    const placeholder = findPlaceholder(encoded)
    if (placeholder !== undefined) {
      throw new Error(
        `${label}: entry #${wire.seq} (${path}) has a shared value that can't be decoded, because it was logged as a ${placeholder} placeholder`
      )
    }
    const out: { [name: string]: unknown } = {}
    for (const read of reads) {
      const value = Object.hasOwn(encoded, read.name)
        ? encoded[read.name]
        : undefined
      const schema = read.owner.definition.sharesSchema
      out[read.name] = value === undefined || schema === undefined
        ? value
        : decodeWith(wire, `shared "${read.name}"`, schema, value)
    }
    return out
  }
  const read = (entry: typeof first) => {
    if (typeof entry.component !== "string") {
      return {
        results: (entry as MessageLog.Update | MessageLog.Mounted).queries,
        shared: entry._tag === "Update"
          ? (entry as MessageLog.Update).shared
          : undefined,
        props: entry.props as Props,
        model: entry.model as Model,
        events: entry.events as ReadonlyArray<Events>,
        commands: (entry as MessageLog.Update).commands.map(
          MessageLog.encodeCommand
        ),
        lists: entry._tag === "Update" ? entry.lists : [],
        sends: entry._tag === "Update"
          ? (entry as MessageLog.Update).sends.map(MessageLog.encodeSend)
          : [],
        message: entry._tag === "Update" ? entry.message as Msg : undefined
      }
    }
    const wire = entry as Extract<
      MessageLog.Wire,
      { _tag: "Update" | "Mounted" }
    >
    return {
      results: wire.queries !== undefined && bound !== undefined
        ? decodeWith(
          entry,
          "queries",
          bound.logSchema,
          wire.queries
        ) as Component.Results
        : undefined,
      shared: wire._tag === "Update" ? sharedOf(wire) : undefined,
      props: decode(entry, "props", wire.props) as Props,
      model: decode(entry, "model", wire.model) as Model,
      events: wire.events.map((emitted) =>
        decode(entry, "events", emitted)
      ) as ReadonlyArray<Events>,
      commands: wire.commands,
      lists: wire._tag === "Update" ? wire.lists : [],
      sends: wire._tag === "Update" ? wire.sends : [],
      message: wire._tag === "Update"
        ? decode(entry, "message", wire.message) as Msg
        : undefined
    }
  }

  const sameModel = Schema.toEquivalence(
    component.model as Schema.Codec<Model, unknown>
  )
  const sameEvents = Schema.toEquivalence(
    Schema.Array(component.events as Schema.Codec<Events, unknown>)
  )
  const sameCommands = (a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>) =>
    JSON.stringify(a) === JSON.stringify(b)

  // A path can hold one instance after another, and the one leaving can still log after the next
  // has mounted, so each instance's state is tracked by its number. The result is the last one's.
  // The last entry each provider's Layer logged, by its instance.
  const layers = new Map<number, Layer>()
  /** What the feature slots reading the provider `boundary` show: nothing once its Layer is ready. */
  const slotStatusOf = (
    boundary: number | undefined
  ): SlotResult | undefined => {
    const entry = boundary === undefined ? undefined : layers.get(boundary)
    if (entry === undefined || entry._tag === "LayerReady") return undefined
    return entry._tag === "LayerPending"
      ? AsyncResult.initial(true)
      : AsyncResult.failure(causeOf(entry))
  }
  interface State {
    model: Model
    props: unknown
    results: Component.Results | undefined
    // The provider whose Layer entries the instance's feature slots read, from its latest entry that says.
    boundary: number | undefined
    // The runs issued and not logged as ended yet, by the entry and index that issued them.
    runs: Map<string, { readonly name: string; readonly group: string | null }>
  }
  const states = new Map<number, State>()
  const issue = (
    state: State,
    entry: { readonly seq: number },
    commands: ReturnType<typeof read>["commands"]
  ) =>
    commands.forEach((command, index) => {
      if (command._tag !== "Interrupt") {
        state.runs.set(`${entry.seq}:${index}`, {
          name: command.name,
          group: command.group
        })
      }
    })
  const begin = (entry: typeof first): State => {
    const initial = read(entry)
    const state: State = {
      model: initial.model,
      props: initial.props,
      results: initial.results,
      boundary: entry.boundary,
      runs: new Map()
    }
    issue(state, entry, initial.commands)
    states.set(entry.instance, state)
    return state
  }
  let latest = begin(first)
  let replayed = 0
  const result = (
    reached: State,
    divergence: Divergence<Model, Msg, Events> | undefined
  ): Replay<Model, Msg, Events, any, any> => {
    const runs = [...reached.runs.values()]
    const out: Replay<Model, Msg, Events, any, any> = {
      path,
      model: reached.model,
      props: reached.props,
      results: reached.results,
      queries: () =>
        bound?.context(reached.model, reached.props, reached.results).queries ??
          {},
      replayed,
      divergence
    }
    reachedOf.set(out, {
      component: component as any,
      slotStatus: slotStatusOf(reached.boundary),
      running: (name, key) =>
        runs.some((run) =>
          run.name === name && (key === undefined || run.group === key)
        )
    })
    return out
  }
  // Before the first Model, only what the Layers logged counts: the slots read it from there on.
  for (let index = 0; index < start; index++) {
    const entry = all[index]!
    if (isLayer(entry)) layers.set(entry.instance, entry)
  }
  for (const entry of all.slice(start + 1)) {
    if (isLayer(entry)) {
      layers.set(entry.instance, entry)
      continue
    }
    const state = states.get(entry.instance)
    if (
      entry._tag === "CommandEnded" || entry._tag === "CommandInterrupted" ||
      entry._tag === "CommandDropped"
    ) {
      state?.runs.delete(`${entry.issued.seq}:${entry.issued.index}`)
      continue
    }
    if (entry._tag === "QueryChanged") {
      // Without a Model yet, the write is in the instance's first surviving `Update`.
      if (state !== undefined) {
        state.results = {
          ...(state.results ?? bound?.empty),
          [entry.name]: resultOf(entry)
        }
      }
      continue
    }
    if (entry._tag === "PropsChanged") {
      if (state !== undefined) {
        state.props = typeof entry.component === "string"
          ? decode(entry, "props", entry.props)
          : entry.props
      }
      continue
    }
    if (state === undefined || entry._tag === "Mounted") {
      // Mounted again at the same path: the replay starts over from it.
      latest = begin(entry)
      continue
    }
    const recorded = read(entry)
    // The Update's record is what `update` read, so it holds even when earlier entries were evicted.
    state.props = recorded.props
    state.boundary = entry.boundary
    if (recorded.results !== undefined) state.results = recorded.results
    const next = component.update(
      state.model,
      recorded.message as Msg,
      recorded.props as Props,
      state.results,
      recorded.shared
    )
    replayed++
    const recomputed = {
      model: next.model,
      events: next.events,
      commands: next.commands.map(MessageLog.encodeCommand),
      lists: next.lists ?? [],
      sends: (next.sends ?? []).map(MessageLog.encodeSend)
    }
    if (
      !sameModel(recomputed.model, recorded.model) ||
      !sameEvents(recomputed.events, recorded.events) ||
      !sameCommands(recomputed.commands, recorded.commands) ||
      !sameCommands(recomputed.lists, recorded.lists) ||
      !sameCommands(recomputed.sends, recorded.sends)
    ) {
      return result(state, {
        seq: entry.seq,
        message: recorded.message as Msg,
        recorded: {
          model: recorded.model,
          events: recorded.events,
          commands: recorded.commands,
          lists: recorded.lists,
          sends: recorded.sends
        },
        recomputed
      })
    }
    state.model = recomputed.model
    issue(state, entry, recorded.commands)
  }
  return result(latest, undefined)
}
