import type * as MessageLog from "@effect/ui/MessageLog"
import * as Tool from "effect/ai/Tool"
import * as Toolkit from "effect/ai/Toolkit"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import type * as Inspector from "../Inspector.ts"
import * as Control from "./control.ts"
import type * as History from "./history.ts"
import { diff } from "./inspector.ts"
import * as Read from "./read.ts"
import * as Rules from "./rules.ts"

export interface RequestError {
  readonly lost: boolean
  readonly message: string
}

export interface Page {
  readonly paused: Control.Paused | null
  readonly notRecording: ReadonlyArray<Control.Rule>
  readonly request: (
    request: Control.Request
  ) => Effect.Effect<Schema.Json, RequestError>
}

export interface Backend {
  readonly options: {
    readonly size: number
    readonly dispatch: boolean
    readonly fields?: ReadonlyArray<string> | undefined
  }
  readonly inspector: Inspector.Inspector
  readonly history: History.History
  readonly meta: (session: string) => {
    readonly host: MessageLog.WireHost | undefined
    readonly connected: boolean
  } | undefined
  readonly picked: (session: string) => Control.Picked | undefined
  readonly pageOf: (session: string) => Page | undefined
  readonly until: <A>(check: () => A | undefined) => Effect.Effect<A>
  readonly within: number
}

export const makeWaiters = () => {
  const waiters = new Set<() => void>()
  const next: Effect.Effect<void> = Effect.callback<void>((resume) => {
    const waiter = () => resume(Effect.void)
    waiters.add(waiter)
    return Effect.sync(() => waiters.delete(waiter))
  })
  const until = <A>(check: () => A | undefined): Effect.Effect<A> =>
    Effect.suspend(() => {
      const found = check()
      return found !== undefined
        ? Effect.succeed(found)
        : Effect.andThen(next, until(check))
    })
  const notify = () => {
    const all = Array.from(waiters)
    waiters.clear()
    for (const waiter of all) waiter()
  }
  return { notify, until }
}

export class ToolError extends Schema.TaggedError<ToolError>()("ToolError", {
  message: Schema.String
}) {}

const fail = (message: string) => Effect.fail(new ToolError({ message }))

const budget = 24_000

const Result = Schema.Struct({ result: Schema.Unknown })
const SessionParam = Schema.optionalKey(Schema.String).annotate({
  description:
    "A session id from list_sessions. Defaults to the newest connected session."
})
const Path = Schema.optionalKey(
  Schema.Array(Schema.Union([Schema.String, Schema.Number]))
).annotate({
  description:
    "Keys from the root to a subtree, such as [\"model\", \"notes\", 0]. Use it when a result is an outline."
})

const hints = (
  readonly: boolean,
  destructive: boolean,
  idempotent: boolean,
  openWorld: boolean
) =>
<T extends Tool.Any>(tool: T): T =>
  tool.annotate(Tool.Readonly, readonly).annotate(Tool.Destructive, destructive)
    .annotate(Tool.Idempotent, idempotent).annotate(
      Tool.OpenWorld,
      openWorld
    ) as T

const read = hints(true, false, true, false)
const control = hints(false, false, true, false)
const write = hints(false, true, false, true)

const ListSessions = read(Tool.make("list_sessions", {
  description:
    "Lists the sessions the server holds. A session is one mounted root: a page load, a server render, or a terminal app. " +
    "Shows whether its page is connected, whether it can be controlled (show_entry, resume, set_recording, " +
    "dispatch), where it is paused, and the rules its page is not recording.",
  success: Result,
  failure: ToolError
}))

const ListInstances = read(Tool.make("list_instances", {
  description:
    "Lists the component instances of a session with their instance number, path, the seq of their " +
    "Mounted and Unmounted entries, and the state of their Command runs.",
  parameters: Schema.Struct({ session: SessionParam }),
  success: Result,
  failure: ToolError
}))

const ListEntries = read(Tool.make("list_entries", {
  description:
    "Lists log entries as rows without payloads, oldest first. Without after, returns the newest limit " +
    "rows. filter \"messages\" keeps updates, mounts and failures, \"commands\" adds Command runs. " +
    "Rows include available declared fields and the field used for filtering in a fields object. " +
    "Only top-level string, number and boolean values from messages or Command args are included. " +
    "Read one entry with get_entry, its causal chain with get_chain.",
  parameters: Schema.Struct({
    session: SessionParam,
    instance: Schema.optionalKey(Schema.Number),
    filter: Schema.optionalKey(
      Schema.Literals(["messages", "commands", "all"])
    ),
    tag: Schema.optionalKey(Schema.String).annotate({
      description: "An entry _tag or a message _tag."
    }),
    after: Schema.optionalKey(Schema.Number).annotate({
      description: "Only entries with a seq above this."
    }),
    field: Schema.optionalKey(Read.Field).annotate({
      description:
        "Only entries whose message or Command args has this top-level field with this value. " +
        "The type counts: 42 and \"42\" differ."
    }),
    limit: Schema.optionalKey(
      Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 500 }))
    ).annotate({
      description: "At most this many rows, 50 by default, 500 at most."
    })
  }),
  success: Result,
  failure: ToolError
}))

const CountEntries = read(Tool.make("count_entries", {
  description:
    "Counts the entries the session holds by entry _tag, and Update entries by message _tag.",
  parameters: Schema.Struct({
    session: SessionParam,
    instance: Schema.optionalKey(Schema.Number)
  }),
  success: Result,
  failure: ToolError
}))

const GetEntry = read(Tool.make("get_entry", {
  description:
    "Returns one entry as its Wire frame: the message, Model, props, Commands and source of an Update, " +
    "the init Model and Commands of a Mounted. Redacted values are shown as placeholders.",
  parameters: Schema.Struct({
    session: SessionParam,
    seq: Schema.Number,
    path: Path
  }),
  success: Result,
  failure: ToolError
}))

const GetChain = read(Tool.make("get_chain", {
  description:
    "Returns the causal chain of an entry: what sent its message, the Commands it issued, when each " +
    "started and how it ended, and what each run sent back.",
  parameters: Schema.Struct({ session: SessionParam, seq: Schema.Number }),
  success: Result,
  failure: ToolError
}))

const GetState = read(Tool.make("get_state", {
  description:
    "Returns an instance's Model, props and query results now, or as they were at an entry.",
  parameters: Schema.Struct({
    session: SessionParam,
    instance: Schema.Number,
    at: Schema.optionalKey(Schema.Number).annotate({
      description:
        "The seq to read the state at. Defaults to the latest, a stopped entry's included."
    }),
    path: Path
  }),
  success: Result,
  failure: ToolError
}))

const DiffState = read(Tool.make("diff_state", {
  description:
    "Lists what an Update, Mounted or Waiting entry changed in its instance's Model, compared with the " +
    "instance's state entry before it, or with its state at from. A change involving a placeholder is \"unknown\".",
  parameters: Schema.Struct({
    session: SessionParam,
    seq: Schema.Number,
    from: Schema.optionalKey(Schema.Number)
  }),
  success: Result,
  failure: ToolError
}))

const ShowEntry = control(Tool.make("show_entry", {
  description:
    "Pauses the page and paints it as it was at an entry, beside the live page, which keeps running " +
    "hidden. The DevTools panel shows it as paused. fellBack lists instances with no state there, shown from init. " +
    "skipped lists instances with an element mount that didn't run there, such as a canvas drawn by a worker, which may show blank. " +
    "Call resume to show the live page again.",
  parameters: Schema.Struct({ session: SessionParam, seq: Schema.Number }),
  success: Result,
  failure: ToolError
}))

const Resume = control(Tool.make("resume", {
  description:
    "Removes the painted copy and shows the live page, whether an agent or a person paused it.",
  parameters: Schema.Struct({ session: SessionParam }),
  success: Result,
  failure: ToolError
}))

const SetRecording = control(Tool.make("set_recording", {
  description:
    "Stops or starts recording, on the session's page, the entries a rule matches: give at least one of tag, " +
    "component and path, and every one given must match. With tag, the rule matches updates of that message " +
    "_tag and the PropsChanged entries they cause; without it, every entry of the matched instances. " +
    "Stopped entries get no rows and take no slots. " +
    "The choice overrides the page's exclude and lasts until the tab closes. " +
    "Returns the rules the page is not recording.",
  parameters: Schema.Struct({
    session: SessionParam,
    tag: Schema.optional(Schema.String).annotate({
      description: "A message _tag."
    }),
    component: Schema.optional(Schema.String).annotate({
      description: "A component name, as list_instances shows it."
    }),
    path: Schema.optional(Schema.String).annotate({
      description:
        "An instance path: the rule matches it and every instance below it."
    }),
    recording: Schema.Boolean
  }),
  success: Result,
  failure: ToolError
}))

const GetMessageSchema = read(Tool.make("get_message_schema", {
  description:
    "Returns dispatch JSON Schema and per-tag examples, filtered by _tag when given. " +
    "Entries with only message pass the dispatch decoder and are ready to send. " +
    "Templates need edits: replace { \"~redacted\": true } placeholders when redacted is true, " +
    "and fix decode errors reported by invalid. Entries without message have no safe example; " +
    "invalid explains why.",
  parameters: Schema.Struct({
    session: SessionParam,
    instance: Schema.Number,
    tag: Schema.optionalKey(Schema.String).annotate({
      description: "Narrows the schema to one message _tag."
    })
  }),
  success: Result,
  failure: ToolError
}))

const FindInstances = read(Tool.make("find_instances", {
  description:
    "Finds the instances that rendered the page's elements matching a CSS selector, in document order: " +
    "each match's tag, instance, path, component and index in document.querySelectorAll(selector). " +
    "Elements outside the session's root are left out. Returns the first 20 matches and the total. " +
    "Returns no element text.",
  parameters: Schema.Struct({
    session: SessionParam,
    selector: Schema.String.annotate({ description: "A CSS selector." })
  }),
  success: Result,
  failure: ToolError
}))

const GetPicked = read(Tool.make("get_picked", {
  description:
    "Returns the element last picked with the DevTools Pick button in the session: its tag and the instance, " +
    "path and component that rendered it, or null before any pick. Returns no element text.",
  parameters: Schema.Struct({ session: SessionParam }),
  success: Result,
  failure: ToolError
}))

const Dispatch = write(Tool.make("dispatch", {
  description:
    "Sends messages to an instance, in order, as if the app had. Each runs update and its real Commands. " +
    "Messages are decoded with the component's message Schema first, and none is sent unless all decode. A " +
    "redacted field needs a real value. Stops at the first message that does not update, or when the batch " +
    "runs out of time, and lists the messages it did not send. An Unknown outcome means the message was sent " +
    "but did not finish in time and may still be applied, so read before resending it. Off unless the server " +
    "was started with dispatch on. Use wait to let the Commands finish.",
  parameters: Schema.Struct({
    session: SessionParam,
    instance: Schema.Number,
    messages: Schema.Array(Schema.Json).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(100)
    )
  }),
  success: Result,
  failure: ToolError
}))

const Wait = read(Tool.make("wait", {
  description:
    "Waits until the Command runs issued after since have ended, or the timeout passes. Scope it with " +
    "instance or run so a long-lived stream does not hold it up. Returns the runs still open on timeout.",
  parameters: Schema.Struct({
    session: SessionParam,
    since: Schema.optionalKey(Schema.Number).annotate({
      description: "Only runs issued by entries after this seq."
    }),
    instance: Schema.optionalKey(Schema.Number),
    run: Schema.optionalKey(
      Schema.Struct({ seq: Schema.Number, index: Schema.Number })
    ).annotate({
      description:
        "One run, by the seq of the entry that issued it and its index in that entry's commands."
    }),
    timeout: Schema.optionalKey(
      Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 60_000 }))
    ).annotate({
      description: "Milliseconds, 5000 by default."
    })
  }),
  success: Result,
  failure: ToolError
}))

export const Tools = Toolkit.make(
  ListSessions,
  ListInstances,
  ListEntries,
  CountEntries,
  GetEntry,
  GetChain,
  GetState,
  DiffState,
  ShowEntry,
  Resume,
  SetRecording,
  GetMessageSchema,
  FindInstances,
  GetPicked,
  Dispatch,
  Wait
)

export const instructions =
  "Inspects a running Effect UI app in development. Start with list_sessions and list_instances. " +
  "list_entries and get_chain explain what happened and why; get_state and diff_state show state at any entry. " +
  "show_entry paints the page at an entry, resume returns to the live page. set_recording stops or resumes " +
  "recording by message _tag, component or subtree. find_instances and get_picked find the instance that rendered an element. " +
  "dispatch sends messages when " +
  "enabled, and wait lets the Commands they start finish."

const select = (
  value: unknown,
  path: ReadonlyArray<string | number> | undefined
) => {
  let at = value
  for (const key of path ?? []) {
    if (typeof at !== "object" || at === null || !Object.hasOwn(at, key)) {
      return fail(
        "No value at " + JSON.stringify(path) + ": " + JSON.stringify(key) +
          " is missing"
      )
    }
    at = (at as Record<string | number, unknown>)[key]
  }
  return Effect.succeed(at)
}

const sizeOf = (value: unknown) => JSON.stringify(value)?.length ?? 0

const outline = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null) {
    return { type: typeof value, bytes: sizeOf(value) }
  }
  const children = Object.entries(value).map(([key, child]) => {
    const bytes = sizeOf(child)
    return [
      key,
      typeof child === "object" && child !== null
        ? {
          type: Array.isArray(child) ? "array" : "object",
          bytes,
          size: Object.keys(child).length
        }
        : bytes > 200
        ? { type: typeof child, bytes }
        : child
    ]
  })
  return Array.isArray(value)
    ? children.map(([, child]) => child)
    : Object.fromEntries(children)
}

const fit = (value: unknown, path?: ReadonlyArray<string | number>) =>
  Effect.map(
    select(value, path),
    (selected) =>
      sizeOf(selected) <= budget ? selected : {
        "~outline": outline(selected),
        note: "Over " + budget + " bytes: pass path to read a subtree."
      }
  )

const ok = (result: unknown) => ({ result })

const omitNull = <A extends Record<string, unknown>>(record: A): Partial<A> =>
  Object.fromEntries(
    Object.entries(record).filter(([, value]) =>
      value !== undefined && value !== null
    )
  ) as Partial<A>

const isState = (entry: MessageLog.WireEntry | Inspector.Outside) =>
  entry._tag === "Waiting" || entry._tag === "Mounted" ||
    entry._tag === "Update"
    ? entry
    : undefined

export const handlers = (server: Backend) => {
  const { history, inspector, options } = server
  const declared = Read.fieldNames(options.fields)

  const sessionOf = (id: string | undefined) =>
    Effect.suspend(() => {
      if (id !== undefined) {
        const found = inspector.sessions().find((session) => session.id === id)
        return found === undefined
          ? fail("No session " + id + ". Call list_sessions.")
          : Effect.succeed(found)
      }
      const sessions = inspector.sessions()
      const newest = [...sessions].reverse().find((session) =>
        server.meta(session.id)?.connected
      ) ?? sessions.at(-1)
      return newest === undefined
        ? fail(
          "No session has connected yet. Open the app with DevTools.layer in development."
        )
        : Effect.succeed(newest)
    })

  const pageOf = (session: Inspector.Session) => {
    const page = server.pageOf(session.id)
    return page === undefined
      ? fail(
        "Session " + session.id +
          " can't be controlled: it is server rendered or a terminal app, or its tab was closed or reloaded."
      )
      : Effect.succeed(page)
  }

  const arrival = (session: Inspector.Session, seq: number) => {
    if ((server.history.latest(session.id) ?? -1) < seq) return undefined
    if (session.resolve(seq)._tag !== "Outside") return "seen"
    return server.history.missing(session.id, seq)
  }

  const ask = (session: Inspector.Session, request: Control.Request) =>
    Effect.flatMap(
      pageOf(session),
      (page) =>
        Effect.mapError(
          page.request(request),
          (error) => new ToolError({ message: error.message })
        )
    )

  const entryOf = (session: Inspector.Session, seq: number) => {
    const entry = session.resolve(seq)
    return entry._tag === "Outside"
      ? fail("Entry #" + seq + " is not in the session's buffer.")
      : Effect.succeed(entry)
  }

  const row = (
    session: Inspector.Session,
    entry: MessageLog.WireEntry,
    names: ReadonlyArray<string>
  ) => {
    const label = Read.rowOf(session, entry)
    const fields = Read.fieldsOf(session, entry, names)
    return omitNull({
      seq: entry.seq,
      tag: entry._tag,
      instance: Read.instanceOf(entry),
      path: "path" in entry ? entry.path : undefined,
      label: [label.text, label.detail].filter(Boolean).join(" "),
      changed: session.previous(entry.seq)?.changed,
      causedBy: entry.causedBy,
      fields: fields.length === 0
        ? undefined
        : Object.fromEntries(fields.map(({ name, value }) => [name, value]))
    })
  }

  const ref = (r: Read.Ref) => ({ seq: r.seq, is: Read.summaryOf(r.entry) })

  const step = (s: Read.Step): unknown => {
    switch (s._tag) {
      case "Source":
        return omitNull({
          step: "source",
          source: s.source,
          link: s.link && ref(s.link)
        })
      case "Link":
        return { step: s.rel, ...ref(s.ref) }
      case "Entry":
        return omitNull({
          step: "entry",
          ...ref(s.ref),
          stopped: s.stopped !== undefined && s.stopped.length > 0
            ? s.stopped.map(ref)
            : undefined
        })
      case "Command":
        return omitNull({
          step: "command",
          index: s.index,
          command: s.command,
          stopped: s.stopped.length > 0 ? s.stopped.map(ref) : undefined
        })
      case "Started":
        return { step: "started", ...ref(s.ref) }
      case "NotStarted":
        return { step: "not started", ended: s.ended }
      case "End":
        return omitNull({
          step: "end",
          ...ref(s.ref),
          reason: "reason" in s.ref.entry ? s.ref.entry.reason : undefined,
          afterMs: s.after
        })
      case "Running":
        return omitNull({ step: "running", since: s.since && ref(s.since) })
      case "Result":
        return { step: "result", ...ref(s.ref) }
      case "CausedBy":
        return { step: "causedBy", ...ref(s.ref) }
      case "Names":
        return {
          step: "named by",
          links: s.links.map((l) => ({
            rel: l.rel,
            seq: l.seq,
            is: Read.summaryOf(l.entry)
          }))
        }
    }
  }

  const open = (session: Inspector.Session, params: {
    readonly since?: number | undefined
    readonly instance?: number | undefined
    readonly run?: MessageLog.Issued | undefined
  }) =>
    session.records(params.instance).filter((record) =>
      record.kind === "command" && record.end === undefined &&
      record.issued !== undefined &&
      (params.since === undefined || record.issued.seq > params.since) &&
      (params.run === undefined ||
        (record.issued.seq === params.run.seq &&
          record.issued.index === params.run.index))
    )

  const handlers = Tools.toLayer({
    list_sessions: () =>
      Effect.sync(() =>
        ok(
          inspector.sessions().map((session) => {
            const entries = session.entries()
            const info = server.meta(session.id)
            const page = server.pageOf(session.id)
            return omitNull({
              session: session.id,
              app: session.app,
              host: info?.host,
              connected: info?.connected ?? false,
              controllable: page !== undefined,
              paused: page?.paused?.session === session.id
                ? page.paused.seq
                : undefined,
              notRecording: page?.notRecording,
              instances: session.instances().length,
              entries: entries.length,
              first: entries[0]?.seq,
              last: entries.at(-1)?.seq
            })
          })
        )
      ),
    list_instances: ({ session }) =>
      Effect.map(sessionOf(session), (s) =>
        ok(
          s.instances().map((instance) =>
            omitNull({
              ...instance,
              status: Read.statusesOf(s.summary(instance.instance)!).map((
                status
              ) => status.text).join(", ") || undefined
            })
          )
        )),
    list_entries: ({ after, field, filter, instance, limit, session, tag }) =>
      Effect.map(sessionOf(session), (s) => {
        const rows = s.entries().filter((entry) =>
          Read.matches(entry, filter ?? "all") &&
          (instance === undefined || Read.instanceOf(entry) === instance) &&
          (after === undefined || entry.seq > after) &&
          (tag === undefined || entry._tag === tag ||
            (entry._tag === "Update" && Read.tagOf(entry.message) === tag)) &&
          (field === undefined || Read.hasField(s, entry, field))
        )
        const names = field === undefined
          ? declared
          : [...declared, field.name]
        const max = limit ?? 50
        const shown = after === undefined
          ? rows.slice(-max)
          : rows.slice(0, max)
        return ok({
          total: rows.length,
          rows: shown.map((entry) => row(s, entry, names))
        })
      }),
    count_entries: ({ instance, session }) =>
      Effect.map(sessionOf(session), (s) => {
        const entries: Record<string, number> = {}
        const messages: Record<string, number> = {}
        for (const entry of s.entries()) {
          if (instance !== undefined && Read.instanceOf(entry) !== instance) {
            continue
          }
          entries[entry._tag] = (entries[entry._tag] ?? 0) + 1
          const tag = entry._tag === "Update"
            ? Read.tagOf(entry.message)
            : undefined
          if (tag !== undefined) messages[tag] = (messages[tag] ?? 0) + 1
        }
        return ok({ entries, messages })
      }),
    get_entry: Effect.fnUntraced(function*({ path, seq, session }) {
      const s = yield* sessionOf(session)
      return ok(yield* fit(yield* entryOf(s, seq), path))
    }),
    get_chain: Effect.fnUntraced(function*({ seq, session }) {
      const s = yield* sessionOf(session)
      const entry = yield* entryOf(s, seq)
      return ok(yield* fit(Read.chainOf(s, entry).map(step)))
    }),
    get_state: Effect.fnUntraced(function*({ at, instance, path, session }) {
      const s = yield* sessionOf(session)
      const seq = at ?? history.latest(s.id) ?? -1
      const held = history.instanceAt(s.id, seq, instance)
      if (held === "outside") {
        return yield* fail(
          "#" + seq + " is older than the last " + options.size +
            " entries the server keeps."
        )
      }
      if (held === undefined) {
        return yield* fail(
          "Instance " + instance + " has no state at #" + seq + "."
        )
      }
      const state = omitNull({
        instance,
        path: held.path,
        at: seq,
        unmounted: held.unmounted === undefined
          ? undefined
          : "unmounted at #" + held.unmounted,
        model: held.model,
        props: held.props,
        queries: held.queries
      })
      return ok(yield* fit(state, path))
    }),
    diff_state: Effect.fnUntraced(function*({ from, seq, session }) {
      const s = yield* sessionOf(session)
      const entry = isState(s.resolve(seq))
      if (entry === undefined) {
        return yield* fail(
          "#" + seq + " is not a Waiting, Mounted or Update entry held."
        )
      }
      let before: Schema.Json | undefined
      let base: number | undefined = from
      if (from !== undefined) {
        const held = history.instanceAt(s.id, from, entry.instance)
        if (held === "outside" || held === undefined) {
          return yield* fail(
            "Instance " + entry.instance + " has no state at #" + from + "."
          )
        }
        before = held.model as Schema.Json
      } else {
        const previous = s.previous(seq)
        if (previous === undefined) {
          return ok({
            instance: entry.instance,
            to: seq,
            first: true,
            changes: []
          })
        }
        base = previous.seq
        const earlier = isState(s.resolve(previous.seq))
        before = earlier?.model ?? previous.model
        if (before === undefined) {
          return yield* fail(
            "The state entry before #" + seq + " is no longer held."
          )
        }
      }
      return ok(
        yield* fit({
          instance: entry.instance,
          path: entry.path,
          from: base,
          to: seq,
          changes: diff(before, entry.model)
        })
      )
    }),
    show_entry: Effect.fnUntraced(function*({ seq, session }) {
      const s = yield* sessionOf(session)
      yield* entryOf(s, seq)
      const shown = yield* ask(s, { _tag: "Show", session: s.id, seq })
      return ok({ paused: seq, ...(shown as object) })
    }),
    resume: Effect.fnUntraced(function*({ session }) {
      const s = yield* sessionOf(session)
      yield* ask(s, { _tag: "Resume" })
      return ok({ resumed: true })
    }),
    set_recording: Effect.fnUntraced(
      function*({ component, path, recording, session, tag }) {
        const rule = Rules.clean({ tag, component, path })
        if (!Rules.isRule(rule)) {
          return yield* fail("Give a tag, a component or a path.")
        }
        const s = yield* sessionOf(session)
        return ok(yield* ask(s, { _tag: "SetRecording", rule, recording }))
      }
    ),
    get_message_schema: Effect.fnUntraced(
      function*({ instance, session, tag }) {
        const s = yield* sessionOf(session)
        return ok(
          yield* ask(s, {
            _tag: "MessageSchema",
            session: s.id,
            instance,
            ...(tag === undefined ? {} : { tag })
          })
        )
      }
    ),
    find_instances: Effect.fnUntraced(function*({ selector, session }) {
      const s = yield* sessionOf(session)
      return ok(yield* ask(s, { _tag: "Find", session: s.id, selector }))
    }),
    get_picked: ({ session }) =>
      Effect.map(
        sessionOf(session),
        (s) => ok(server.picked(s.id) ?? null)
      ),
    dispatch: Effect.fnUntraced(function*({ instance, messages, session }) {
      if (!options.dispatch) {
        return yield* fail(
          "Dispatch is off. Start the server with dispatch: true in the Vite plugin, or --dispatch."
        )
      }
      const s = yield* sessionOf(session)
      const page = yield* pageOf(s)
      const before = s.entries().at(-1)?.seq
      const reply = Schema.decodeUnknownSync(Control.Dispatched)(
        yield* page.request({
          _tag: "Dispatch",
          session: s.id,
          instance,
          messages,
          within: server.within
        }).pipe(Effect.mapError((error) =>
          new ToolError({
            message: error.lost
              ? "No reply: " + error.message + ". Any of the messages may " +
                "have been applied, or none. Read the entries " +
                (before === undefined ? "" : "after #" + before + " ") +
                "before resending."
              : error.message
          })
        ))
      )
      const logged = reply.outcomes.flatMap((outcome) =>
        outcome._tag === "Updated" || outcome._tag === "Failed"
          ? [outcome.seq]
          : []
      )
      if (logged.length > 0) {
        const newest = Math.max(...logged)
        yield* server.until(() => arrival(s, newest)).pipe(
          Effect.timeoutOption("2 seconds")
        )
      }
      const unseen: Array<number> = []
      const unavailable: Array<{ seq: number; reason: string }> = []
      for (const seq of logged) {
        const reason = arrival(s, seq)
        if (reason === undefined) unseen.push(seq)
        else if (reason !== "seen") unavailable.push({ seq, reason })
      }
      const sent = reply.outcomes.length
      const last = reply.outcomes.at(-1)
      const notSent = Array.from(
        { length: messages.length - sent },
        (_, i) => sent + i
      )
      const seqs = (list: ReadonlyArray<number>) =>
        list.map((seq) => "#" + seq).join(", ")
      const notes = [
        last?._tag === "Unknown"
          ? "Message " + (sent - 1) + " was sent but did not finish in " +
            "time, so it may still be applied. Read before resending it."
          : undefined,
        notSent.length === 0
          ? undefined
          : "Messages " + notSent.join(", ") + " were not sent, " +
            (last === undefined || last._tag === "Updated"
              ? "because the batch ran out of time."
              : last._tag === "Unknown"
              ? "because message " + (sent - 1) + "'s outcome is unknown."
              : "because message " + (sent - 1) + " did not update."),
        unseen.length === 0
          ? undefined
          : "Entries " + seqs(unseen) + " were logged by the page but have " +
            "not reached the server yet, so a read may not show them.",
        unavailable.length === 0
          ? undefined
          : "Entries " + seqs(unavailable.map((u) => u.seq)) + " were " +
            "logged by the page, but the server can't show them: a skipped " +
            "entry was dropped from the page's buffer before it was sent, " +
            "an evicted one is older than the entries kept, and an excluded " +
            "one matched a rule the page is not recording.",
        reply.paused === null
          ? undefined
          : "The page is paused: resume to see the live page."
      ].filter((note) => note !== undefined)
      return ok(omitNull({
        outcomes: reply.outcomes,
        applied: reply.outcomes.filter((outcome) =>
          outcome._tag === "Updated"
        ).length,
        of: messages.length,
        notSent: notSent.length === 0 ? undefined : notSent,
        paused: reply.paused,
        unseen: unseen.length === 0 ? undefined : unseen,
        unavailable: unavailable.length === 0 ? undefined : unavailable,
        note: notes.length === 0 ? undefined : notes.join(" ")
      }))
    }),
    wait: Effect.fnUntraced(
      function*({ instance, run, session, since, timeout }) {
        const s = yield* sessionOf(session)
        const params = { since, instance, run }
        const done = yield* server.until(() =>
          open(s, params).length === 0 ? true : undefined
        ).pipe(
          Effect.timeoutOrElse({
            duration: timeout ?? 5_000,
            orElse: () => Effect.succeed(false)
          })
        )
        return ok(omitNull({
          settled: done,
          last: s.entries().at(-1)?.seq,
          open: done ? undefined : open(s, params)
        }))
      }
    )
  })

  return handlers
}
