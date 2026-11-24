import * as MessageLog from "@effect/ui/MessageLog"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"
import type * as Inspector from "../Inspector.ts"
import * as Control from "./control.ts"
import * as History from "./history.ts"
import * as InspectorInternal from "./inspector.ts"

export interface Options {
  readonly size: number
  readonly dispatch: boolean
  readonly keep: number
}

export interface Page {
  readonly sessions: Set<string>
  paused: Control.Paused | null
  size: number
  readonly request: (
    request: Control.Request
  ) => Effect.Effect<Schema.Json, string>
}

export interface Meta {
  host: MessageLog.WireHost | undefined
  connected: boolean
  closed: number
}

export interface Server {
  readonly options: Options
  readonly inspector: Inspector.Inspector
  readonly history: History.History
  readonly meta: Map<string, Meta>
  readonly pages: Set<Page>
  readonly pageOf: (session: string) => Page | undefined
  readonly next: Effect.Effect<void>
  readonly arrived: (session: string, seq: number) => Effect.Effect<boolean>
}

const loopback = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

const decodeWire = Schema.decodeUnknownOption(
  Schema.fromJsonString(MessageLog.Wire)
)

export const make = (options: Options) => {
  const inspector = InspectorInternal.make({
    size: options.size,
    isExcluded: () => false
  })
  const history = History.make(options.size)
  const meta = new Map<string, Meta>()
  const pages = new Set<Page>()
  const waiters = new Set<() => void>()
  let closed = 0

  const notify = () => {
    const all = Array.from(waiters)
    waiters.clear()
    for (const waiter of all) waiter()
  }
  const next: Effect.Effect<void> = Effect.callback<void>((resume) => {
    const waiter = () => resume(Effect.void)
    waiters.add(waiter)
    return Effect.sync(() => waiters.delete(waiter))
  })
  const latest = (session: string) =>
    inspector.sessions().find((s) => s.id === session)?.entries().at(-1)?.seq ??
      -1
  const arrived = (session: string, seq: number): Effect.Effect<boolean> =>
    Effect.suspend(function loop(): Effect.Effect<boolean> {
      return latest(session) >= seq
        ? Effect.succeed(true)
        : Effect.andThen(next, Effect.suspend(loop))
    }).pipe(
      Effect.timeoutOrElse({
        duration: "2 seconds",
        orElse: () => Effect.succeed(false)
      })
    )

  const prune = () => {
    const gone = Array.from(meta).filter(([, m]) => !m.connected).sort((
      [, a],
      [, b]
    ) => a.closed - b.closed)
    for (
      const [session] of gone.slice(0, Math.max(0, gone.length - options.keep))
    ) {
      meta.delete(session)
      inspector.remove(session)
      history.drop(session)
    }
  }

  const allowed = (origin: string | undefined) => {
    if (origin === undefined) return true
    try {
      const { hostname } = new URL(origin)
      return loopback.has(hostname) || hostname.endsWith(".localhost")
    } catch {
      return false
    }
  }

  const upgrade = Effect.fnUntraced(function*(
    f: (
      socket: Socket.Socket
    ) => Effect.Effect<void, Socket.SocketError, Scope.Scope>
  ) {
    const request = yield* HttpServerRequest.HttpServerRequest
    if (!allowed(request.headers["origin"])) {
      return HttpServerResponse.empty({ status: 403 })
    }
    const socket = yield* request.upgrade
    yield* f(socket).pipe(Effect.catchTag("SocketError", () => Effect.void))
    return HttpServerResponse.empty()
  }, Effect.scoped)

  const log = HttpRouter.add(
    "GET",
    "/log",
    upgrade((socket) => {
      let host: MessageLog.WireHost | undefined
      const sessions = new Set<string>()
      return Effect.gen(function*() {
        const pull = yield* Socket.readerString(socket)
        return yield* Effect.forever(Effect.map(pull, (chunks) => {
          const batch: Array<MessageLog.WireEntry> = []
          for (const chunk of chunks) {
            const decoded = decodeWire(chunk)
            if (decoded._tag === "None") continue
            const frame = decoded.value
            if (frame._tag === "Hello") {
              host = frame.host
              continue
            }
            if (!sessions.has(frame.session)) {
              sessions.add(frame.session)
              const known = meta.get(frame.session)
              if (known === undefined) {
                meta.set(frame.session, { host, connected: true, closed: 0 })
              } else known.connected = true
            }
            batch.push(frame)
          }
          if (batch.length === 0) return
          const before = new Map(
            batch.map((frame) => [frame.session, latest(frame.session)])
          )
          inspector.ingest(batch)
          for (const frame of batch) {
            if (frame.seq > before.get(frame.session)!) history.record(frame)
          }
          notify()
        }))
      }).pipe(Effect.ensuring(Effect.sync(() => {
        for (const session of sessions) {
          const known = meta.get(session)
          if (known !== undefined) {
            Object.assign(known, { connected: false, closed: ++closed })
          }
        }
        prune()
        notify()
      })))
    })
  )

  const control = HttpRouter.add(
    "GET",
    "/control",
    upgrade((socket) => {
      const pending = new Map<number, Deferred.Deferred<Schema.Json, string>>()
      let id = 0
      let page: Page | undefined
      return Effect.gen(function*() {
        const writer = yield* socket.writer
        const pull = yield* Socket.readerString(socket)
        const opened: Page = page = {
          sessions: new Set(),
          paused: null,
          size: options.size,
          request: (request) => {
            const at = ++id
            return Effect.gen(function*() {
              const deferred = yield* Deferred.make<Schema.Json, string>()
              pending.set(at, deferred)
              yield* writer.write(
                Control.encodeToPage({ _tag: "Request", id: at, request })
              ).pipe(
                Effect.mapError(() => "the page's control connection is closed")
              )
              return yield* Deferred.await(deferred).pipe(
                Effect.timeoutOrElse({
                  duration: "10 seconds",
                  orElse: () =>
                    Effect.fail("the page did not answer within 10 seconds")
                })
              )
            }).pipe(Effect.ensuring(Effect.sync(() => pending.delete(at))))
          }
        }
        pages.add(opened)
        yield* writer.write(
          Control.encodeToPage({ _tag: "Config", dispatch: options.dispatch })
        )
        return yield* Effect.forever(
          Effect.flatMap(pull, (chunks) =>
            Effect.forEach(chunks, (chunk) => {
              const decoded = Control.decodeToServer(chunk)
              if (decoded._tag === "None") return Effect.void
              const message = decoded.value
              if (message._tag === "State") {
                opened.sessions.clear()
                for (const session of message.sessions) {
                  opened.sessions.add(session)
                }
                opened.paused = message.paused
                opened.size = message.size
                notify()
                return Effect.void
              }
              const deferred = pending.get(message.id)
              if (deferred === undefined) return Effect.void
              return message.ok
                ? Deferred.succeed(deferred, message.value)
                : Deferred.fail(deferred, String(message.value))
            }, { discard: true }))
        )
      }).pipe(Effect.ensuring(Effect.suspend(() => {
        if (page !== undefined) pages.delete(page)
        notify()
        return Effect.forEach(
          pending.values(),
          (deferred) => Deferred.fail(deferred, "the page closed"),
          {
            discard: true
          }
        )
      })))
    })
  )

  const server: Server = {
    options,
    inspector,
    history,
    meta,
    pages,
    pageOf: (session) =>
      Array.from(pages).reverse().find((page) => page.sessions.has(session)),
    next,
    arrived
  }
  return { server, routes: Layer.mergeAll(log, control) }
}
