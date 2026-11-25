import * as BrowserHost from "@effect/ui/html/BrowserHost"
import * as MessageLog from "@effect/ui/MessageLog"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import * as Control from "./control.ts"
import * as InspectorInternal from "./inspector.ts"
import {
  Clear,
  type Feed,
  Overlay,
  Pages,
  Paint,
  SaveOpen,
  SavePosition
} from "./overlay.ts"
import { styles } from "./styles.ts"

const decodeWire = Schema.decodeUnknownOption(
  Schema.fromJsonString(MessageLog.Wire)
)

const standaloneStyles = `
html, body, #root, .overlay { height: 100%; }
body { background: var(--bg); }
#root { width: auto; }
.panel { width: 100%; height: 100%; border: 0; border-radius: 0; }
`

// The DevTools server's page: the overlay's panel, filling the tab, fed by the frames the server holds on `/watch`.
export const mount = (
  container: HTMLElement,
  options: { readonly server: string; readonly size: number }
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    const inspector = InspectorInternal.make({
      size: options.size,
      isExcluded: () => false
    })
    const origins = new Map<string, number>()
    const changes = yield* PubSub.sliding<void>(1)
    const feed: Feed = {
      inspector,
      origin: (session) => origins.get(session),
      changes: Stream.fromPubSub(changes),
      paintable: () => false,
      paused: () => undefined,
      failures: () => 0,
      open: true,
      position: () => "BottomRight",
      standalone: true
    }
    const pages = Pages.of({
      paint: () => Effect.undefined,
      resume: Effect.void,
      clear: (id) =>
        Effect.sync(() =>
          inspector.sessions().find((session) => session.id === id)?.clear()
        ),
      setOpen: () => Effect.void,
      setPosition: () => Effect.void
    })
    yield* BrowserHost.mountEffect(Overlay, { feed }, container, {
      head: false
    }).pipe(
      Effect.provideService(MessageLog.MessageLog, MessageLog.noop),
      Effect.provide(
        Layer.mergeAll(
          Paint.layer,
          Clear.layer,
          SaveOpen.layer,
          SavePosition.layer
        ).pipe(Layer.provide(Layer.succeed(Pages, pages)))
      )
    )
    const watch = Effect.gen(function*() {
      const socket = yield* Socket.makeWebSocket(
        Control.socketUrl(options.server, "/watch")
      )
      const pull = yield* Socket.readerString(socket)
      return yield* Effect.forever(Effect.flatMap(pull, (chunks) => {
        const batch: Array<MessageLog.WireEntry> = []
        for (const chunk of chunks) {
          const decoded = decodeWire(chunk)
          if (decoded._tag === "None" || decoded.value._tag === "Hello") {
            continue
          }
          const frame = decoded.value
          if (!origins.has(frame.session)) origins.set(frame.session, frame.at)
          batch.push(frame)
        }
        if (batch.length === 0) return Effect.void
        inspector.ingest(batch)
        return PubSub.publish(changes, undefined)
      }))
    }).pipe(Effect.scoped)
    yield* watch.pipe(
      Effect.retry(Schedule.spaced("1 second")),
      Effect.forever,
      Effect.forkScoped
    )
  }).pipe(Effect.provide(Socket.layerWebSocketConstructorGlobal))

const sizeOf = (): number => {
  const content = document.querySelector<HTMLMetaElement>(
    "meta[name=\"" + Control.metaName + "\"]"
  )?.content
  try {
    const size = content === undefined ? undefined : JSON.parse(content).size
    return typeof size === "number" ? size : 1_000
  } catch {
    return 1_000
  }
}

export const main = (): void => {
  const style = document.createElement("style")
  style.textContent = styles + standaloneStyles
  document.head.appendChild(style)
  const root = document.getElementById("root")!
  mount(root, { server: location.origin, size: sizeOf() }).pipe(
    Effect.andThen(Effect.never),
    Effect.scoped,
    Effect.runFork
  )
}
