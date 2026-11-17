/**
 * Replay of a logged session: re-runs each logged message through `update`
 * and compares what it produces with what the log recorded.
 *
 * @internal
 */
import * as Schema from "effect/Schema"
import type * as Component from "../Component.ts"
import * as MessageLog from "../MessageLog.ts"
import type { Divergence, Replay } from "../testing/Story.ts"
import type * as View from "../View.ts"
import * as loaders from "./loaders.ts"

const placeholders = ["~unserialisable", "~redacted", "~truncated"]
const findPlaceholder = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  for (const key of Object.keys(value)) {
    if (placeholders.includes(key)) return key
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
export const replayLog = <Name extends string, Props, Model, Msg, Events, R, V extends View.Elements, Rcv>(
  label: string,
  component: Component.Component<Name, Props, Model, Msg, Events, R, V, any, Rcv>,
  entries: ReadonlyArray<MessageLog.Entry | MessageLog.Wire>,
  options?: { readonly path?: string | undefined }
): Replay<Model, Msg, Events, any, any> => {
  // The entries that carry an instance's state, each with its component.
  type Stateful =
    | MessageLog.Update
    | MessageLog.Mounted
    | MessageLog.LoaderChanged
    | MessageLog.PropsChanged
    | Extract<MessageLog.Wire, { _tag: "Update" | "Mounted" | "LoaderChanged" | "PropsChanged" }>
  const stateful = entries.filter((entry): entry is Stateful =>
    entry._tag === "Update" || entry._tag === "Mounted" || entry._tag === "LoaderChanged" ||
    entry._tag === "PropsChanged"
  )
  const path = options?.path ??
    stateful.find((entry) =>
      (typeof entry.component === "string" ? entry.component : entry.component.definition.name) ===
        component.definition.name
    )?.path
  if (path === undefined) throw new Error(`${label}: the log has no entry for ${component.definition.name}`)
  const all = stateful.filter((entry) => entry.path === path)
  // The replay starts at the first Model. Props and loader state written before it are in that Update's record, or
  // belong to an earlier mount.
  const start = all.findIndex((entry) => entry._tag === "Update" || entry._tag === "Mounted")
  if (start === -1) throw new Error(`${label}: the log has no entry for ${path}`)
  const first = all[start] as
    | MessageLog.Update
    | MessageLog.Mounted
    | Extract<MessageLog.Wire, { _tag: "Update" | "Mounted" }>
  const bound = loaders.boundOf(component)
  const stateOf = (entry: MessageLog.LoaderChanged | Extract<MessageLog.Wire, { _tag: "LoaderChanged" }>) => {
    if (typeof entry.component !== "string") return entry.state
    const schema = bound?.logSchema.fields[entry.name]
    if (schema === undefined) {
      throw new Error(`${label}: entry #${entry.seq} (${path}) writes "${entry.name}", which isn't a loader`)
    }
    return decodeWith(entry, `loader "${entry.name}"`, schema, entry.state)
  }

  const decoders = new Map<Schema.Top, (value: unknown) => unknown>()
  const decode = (
    entry: { readonly seq: number },
    field: "props" | "model" | "message" | "events",
    value: unknown
  ): any => decodeWith(entry, field, component[field] as Schema.Top, value)
  function decodeWith(entry: { readonly seq: number }, field: string, schema: Schema.Top, value: unknown): any {
    let run = decoders.get(schema)
    if (run === undefined) {
      run = Schema.decodeUnknownSync(Schema.toCodecJson(schema as Schema.Codec<unknown, unknown>))
      decoders.set(schema, run)
    }
    try {
      return run(value)
    } catch (error) {
      const placeholder = findPlaceholder(value)
      throw new Error(
        `${label}: entry #${entry.seq} (${path}) has a ${field} that can't be decoded${
          placeholder === undefined ? "" : `, because it was logged as a ${placeholder} placeholder`
        }: ${String(error)}`,
        { cause: error }
      )
    }
  }
  const read = (entry: typeof first) => {
    if (typeof entry.component !== "string") {
      return {
        loaderState: entry._tag === "Update" ? (entry as MessageLog.Update).loaderState : undefined,
        props: entry.props as Props,
        model: entry.model as Model,
        events: entry.events as ReadonlyArray<Events>,
        commands: (entry as MessageLog.Update).commands.map(MessageLog.encodeCommand),
        lists: entry._tag === "Update" ? entry.lists ?? [] : [],
        sends: entry._tag === "Update" ? ((entry as MessageLog.Update).sends ?? []).map(MessageLog.encodeSend) : [],
        message: entry._tag === "Update" ? entry.message as Msg : undefined
      }
    }
    const wire = entry as Extract<MessageLog.Wire, { _tag: "Update" | "Mounted" }>
    return {
      loaderState: wire._tag === "Update" && wire.loaderState !== undefined && bound !== undefined
        ? decodeWith(entry, "loaderState", bound.logSchema, wire.loaderState) as Component.LoaderState
        : undefined,
      props: decode(entry, "props", wire.props) as Props,
      model: decode(entry, "model", wire.model) as Model,
      events: wire.events.map((emitted) => decode(entry, "events", emitted)) as ReadonlyArray<Events>,
      commands: wire.commands,
      lists: wire._tag === "Update" ? wire.lists ?? [] : [],
      sends: wire._tag === "Update" ? wire.sends ?? [] : [],
      message: wire._tag === "Update" ? decode(entry, "message", wire.message) as Msg : undefined
    }
  }

  const sameModel = Schema.toEquivalence(component.model as Schema.Codec<Model, unknown>)
  const sameEvents = Schema.toEquivalence(Schema.Array(component.events as Schema.Codec<Events, unknown>))
  const sameCommands = (a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>) => JSON.stringify(a) === JSON.stringify(b)

  const initial = read(first)
  let model = initial.model
  let props: unknown = initial.props
  let loaderState: Component.LoaderState | undefined = initial.loaderState
  let replayed = 0
  const result = (divergence: Divergence<Model, Msg, Events> | undefined): Replay<Model, Msg, Events, any, any> => {
    const reached = { model, props, loaderState }
    return {
      path,
      ...reached,
      loaded: () => bound?.context(reached.model, reached.props, reached.loaderState).loaded ?? {},
      replayed,
      divergence
    }
  }
  for (const entry of all.slice(start + 1)) {
    if (entry._tag === "LoaderChanged") {
      loaderState = { ...(loaderState ?? bound?.empty), [entry.name]: stateOf(entry) }
      continue
    }
    if (entry._tag === "PropsChanged") {
      props = typeof entry.component === "string" ? decode(entry, "props", entry.props) : entry.props
      continue
    }
    const recorded = read(entry)
    if (entry._tag === "Mounted") {
      // Mounted again at the same path: the replay starts over from it, with every loader empty.
      model = recorded.model
      props = recorded.props
      loaderState = undefined
      continue
    }
    // The Update's record is what `update` read, so it holds even when earlier entries were evicted.
    props = recorded.props
    if (recorded.loaderState !== undefined) loaderState = recorded.loaderState
    const next = component.update(model, recorded.message as Msg, recorded.props as Props, loaderState)
    replayed++
    const recomputed = {
      model: next.model,
      events: next.events,
      commands: next.commands.map(MessageLog.encodeCommand),
      lists: next.lists ?? [],
      sends: (next.sends ?? []).map(MessageLog.encodeSend)
    }
    if (
      !sameModel(recomputed.model, recorded.model) || !sameEvents(recomputed.events, recorded.events) ||
      !sameCommands(recomputed.commands, recorded.commands) || !sameCommands(recomputed.lists, recorded.lists) ||
      !sameCommands(recomputed.sends, recorded.sends)
    ) {
      return result({
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
    model = recomputed.model
  }
  return result(undefined)
}
