import type * as MessageLog from "@effect/ui/MessageLog"
import * as McpProtocol from "effect/ai/McpProtocol"
import * as McpServer from "effect/ai/McpServer"
import * as Tool from "effect/ai/Tool"
import * as Toolkit from "effect/ai/Toolkit"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import type * as Inspector from "../Inspector.ts"
import * as Control from "./control.ts"
import { diff } from "./inspector.ts"
import * as Read from "./read.ts"
import type { Server } from "./server.ts"

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

const read = <T extends Tool.Any>(tool: T): T =>
  tool.annotate(Tool.Readonly, true).annotate(Tool.Destructive, false).annotate(
    Tool.Idempotent,
    true
  )
    .annotate(Tool.OpenWorld, false) as T

const ListSessions = read(Tool.make("list_sessions", {
  description:
    "Lists the sessions the server holds. A session is one mounted root: a page load, or a server render. " +
    "Shows whether its page is connected, whether it can be controlled (show_entry, resume, dispatch), " +
    "and where it is paused.",
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
      description: "The seq to read the state at. Defaults to the latest."
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

const ShowEntry = Tool.make("show_entry", {
  description:
    "Pauses the page and paints it as it was at an entry, beside the live page, which keeps running " +
    "hidden. The DevTools panel shows it as paused. fellBack lists instances with no state there, shown from init. " +
    "Call resume to show the live page again.",
  parameters: Schema.Struct({ session: SessionParam, seq: Schema.Number }),
  success: Result,
  failure: ToolError
}).annotate(Tool.Readonly, false).annotate(Tool.Destructive, false).annotate(
  Tool.Idempotent,
  true
)
  .annotate(Tool.OpenWorld, false)

const Resume = Tool.make("resume", {
  description:
    "Removes the painted copy and shows the live page, whether an agent or a person paused it.",
  parameters: Schema.Struct({ session: SessionParam }),
  success: Result,
  failure: ToolError
}).annotate(Tool.Readonly, false).annotate(Tool.Destructive, false).annotate(
  Tool.Idempotent,
  true
)
  .annotate(Tool.OpenWorld, false)

const GetMessageSchema = read(Tool.make("get_message_schema", {
  description:
    "Returns the JSON Schema of the messages an instance accepts, as dispatch takes them.",
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

const Dispatch = Tool.make("dispatch", {
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
}).annotate(Tool.Readonly, false).annotate(Tool.Destructive, true).annotate(
  Tool.Idempotent,
  false
)
  .annotate(Tool.OpenWorld, true)

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
  GetMessageSchema,
  Dispatch,
  Wait
)

const instructions =
  "Inspects a running Effect UI app in development. Start with list_sessions and list_instances. " +
  "list_entries and get_chain explain what happened and why; get_state and diff_state show state at any entry. " +
  "show_entry paints the page at an entry, resume returns to the live page. dispatch sends messages when the " +
  "server allows it, and wait lets the Commands they start finish."

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
  const children = Object.entries(value).map(([key, child]) => [
    key,
    typeof child === "object" && child !== null
      ? {
        type: Array.isArray(child) ? "array" : "object",
        bytes: sizeOf(child),
        size: Object.keys(child).length
      }
      : sizeOf(child) > 200
      ? { type: typeof child, bytes: sizeOf(child) }
      : child
  ])
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

export const layer = (server: Server) => {
  const { history, inspector, meta, options } = server

  const sessionOf = (id: string | undefined) =>
    Effect.suspend(() => {
      const sessions = inspector.sessions()
      if (id !== undefined) {
        const found = sessions.find((session) => session.id === id)
        return found === undefined
          ? fail("No session " + id + ". Call list_sessions.")
          : Effect.succeed(found)
      }
      const newest = [...sessions].reverse().find((session) =>
        meta.get(session.id)?.connected
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
          " can't be controlled: it is server rendered, or its tab was closed or reloaded."
      )
      : Effect.succeed(page)
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

  const row = (session: Inspector.Session, entry: MessageLog.WireEntry) => {
    const label = Read.rowOf(session, entry)
    return omitNull({
      seq: entry.seq,
      tag: entry._tag,
      instance: Read.instanceOf(entry),
      path: "path" in entry ? entry.path : undefined,
      label: [label.text, label.detail].filter(Boolean).join(" "),
      changed: session.previous(entry.seq)?.changed,
      causedBy: entry.causedBy
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
            const info = meta.get(session.id)
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
              status: Read.statusesOf(s, instance).map((status) =>
                status.text
              ).join(", ") || undefined
            })
          )
        )),
    list_entries: ({ after, filter, instance, limit, session, tag }) =>
      Effect.map(sessionOf(session), (s) => {
        const rows = s.entries().filter((entry) =>
          Read.matches(entry, filter ?? "all") &&
          (instance === undefined || Read.instanceOf(entry) === instance) &&
          (after === undefined || entry.seq > after) &&
          (tag === undefined || entry._tag === tag ||
            (entry._tag === "Update" && Read.tagOf(entry.message) === tag))
        )
        const max = limit ?? 50
        const shown = after === undefined
          ? rows.slice(-max)
          : rows.slice(0, max)
        return ok({
          total: rows.length,
          rows: shown.map((entry) => row(s, entry))
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
      const entry = s.resolve(seq)
      if (entry._tag === "Outside") {
        return yield* fail("Entry #" + seq + " is not in the session's buffer.")
      }
      return ok(yield* fit(entry, path))
    }),
    get_chain: Effect.fnUntraced(function*({ seq, session }) {
      const s = yield* sessionOf(session)
      const entry = s.resolve(seq)
      if (entry._tag === "Outside") {
        return yield* fail("Entry #" + seq + " is not in the session's buffer.")
      }
      return ok(
        yield* fit(JSON.parse(JSON.stringify(Read.chainOf(s, entry).map(step))))
      )
    }),
    get_state: Effect.fnUntraced(function*({ at, instance, path, session }) {
      const s = yield* sessionOf(session)
      const seq = at ?? s.entries().at(-1)?.seq ?? -1
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
      if (s.resolve(seq)._tag === "Outside") {
        return yield* fail("Entry #" + seq + " is not in the session's buffer.")
      }
      const shown = yield* ask(s, { _tag: "Show", session: s.id, seq })
      return ok({ paused: seq, ...(shown as object) })
    }),
    resume: Effect.fnUntraced(function*({ session }) {
      const s = yield* sessionOf(session)
      yield* ask(s, { _tag: "Resume" })
      return ok({ resumed: true })
    }),
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
      const unseen: Array<number> = []
      const unavailable: Array<{ seq: number; reason: string }> = []
      for (const outcome of reply.outcomes) {
        if (outcome._tag !== "Updated" && outcome._tag !== "Failed") continue
        const arrival = yield* server.arrived(s.id, outcome.seq)
        if (arrival === "late") unseen.push(outcome.seq)
        else if (arrival !== "seen") {
          unavailable.push({ seq: outcome.seq, reason: arrival })
        }
      }
      const sent = reply.outcomes.length
      const notSent = Array.from(
        { length: messages.length - sent },
        (_, i) => sent + i
      )
      const seqs = (list: ReadonlyArray<number>) =>
        list.map((seq) => "#" + seq).join(", ")
      const notes = [
        reply.outcomes.at(-1)?._tag === "Unknown"
          ? "Message " + (sent - 1) + " was sent but did not finish in " +
            "time, so it may still be applied. Read before resending it."
          : undefined,
        notSent.length === 0
          ? undefined
          : "Messages " + notSent.join(", ") + " were not sent, " +
            (reply.expired
              ? "because the batch ran out of time."
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
            "and an evicted one is older than the entries the server keeps.",
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
        const settled = Effect.suspend(function loop(): Effect.Effect<void> {
          return open(s, params).length === 0
            ? Effect.void
            : Effect.andThen(server.next, Effect.suspend(loop))
        })
        const done = yield* settled.pipe(
          Effect.as(true),
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

  return McpServer.layerHttp({
    name: "effect-ui-devtools",
    version: "0.1.0",
    instructions,
    path: "/mcp",
    protocols: [
      McpProtocol.v2025_11_25,
      McpProtocol.v2025_06_18,
      McpProtocol.v2025_03_26
    ],
    registrations: McpServer.toolkit(Tools).pipe(Layer.provide(handlers))
  }).pipe(Layer.orDie)
}
