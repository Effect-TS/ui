import * as BrowserHost from "@effect/ui/html/BrowserHost"
import * as MessageLog from "@effect/ui/MessageLog"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import * as Semaphore from "effect/Semaphore"
import * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import * as Control from "./control.ts"
import * as History from "./history.ts"
import * as InspectorInternal from "./inspector.ts"
import { Clear, type Feed, Overlay, Pages, Paint, SaveOpen } from "./overlay.ts"
import * as Remote from "./remote.ts"
import { styles } from "./styles.ts"

export type Position = "TopLeft" | "TopRight" | "BottomLeft" | "BottomRight"

const sizeKey = "@effect/ui-devtools/size"
const openKey = "@effect/ui-devtools/open"

const corners: { readonly [P in Position]: string } = {
  TopLeft: "top:12px;left:12px",
  TopRight: "top:12px;right:12px",
  BottomLeft: "bottom:12px;left:12px",
  BottomRight: "bottom:12px;right:12px"
}

// A painted copy's dialogs and popovers sit in the top layer, above any z-index. While paused the frame
// joins the top layer after them, so the copy never covers the panel.
const raise = (frame: HTMLIFrameElement) => {
  if (typeof frame.showPopover !== "function") return
  frame.setAttribute("popover", "manual")
  if (frame.matches(":popover-open")) frame.hidePopover()
  frame.showPopover()
}

const lower = (frame: HTMLIFrameElement) => {
  if (!frame.hasAttribute("popover")) return
  if (frame.matches(":popover-open")) frame.hidePopover()
  frame.removeAttribute("popover")
}

const fromPage = (): { readonly url?: unknown; readonly size?: unknown } => {
  const content = document.querySelector<HTMLMetaElement>(
    "meta[name=\"" + Control.metaName + "\"]"
  )?.content
  try {
    return content === undefined ? {} : JSON.parse(content)
  } catch {
    return {}
  }
}

const socketUrl = (server: string, path: string) => {
  const url = new URL(path, server)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  return url.href
}

export const make = (options: {
  readonly position?: Position | undefined
  readonly size?: number | undefined
  readonly exclude?: ReadonlyArray<string> | undefined
  readonly server?: string | undefined
}): Layer.Layer<never> =>
  Layer.effectContext(
    Effect.gen(function*() {
      const page = fromPage()
      const server = options.server ??
        (typeof page.url === "string" ? page.url : undefined)
      const size = Math.max(
        1,
        options.size ?? (typeof page.size === "number" ? page.size : 1_000)
      )
      const isExcluded = InspectorInternal.matchTags(new Set(options.exclude))
      const excluded = new Map<string, Set<number>>()
      const inspector = InspectorInternal.make({
        size,
        isExcluded: (entry) =>
          excluded.get(entry.session)?.delete(entry.seq) === true
      })
      const history = History.make(size)
      const roots = new Map<string, BrowserHost.Controllable>()
      let paused: {
        readonly root: BrowserHost.Controllable
        readonly at: Control.Paused
      } | undefined
      const lock = Semaphore.makeUnsafe(1)
      const origins = new Map<string, number>()
      const latest = new Map<string, number>()
      const changes = yield* PubSub.sliding<void>(1)
      const states = yield* PubSub.sliding<void>(1)
      const changed = () => {
        PubSub.publishUnsafe(changes, undefined)
        PubSub.publishUnsafe(states, undefined)
      }
      const view = document.defaultView
      const load = (key: string): unknown => {
        try {
          return JSON.parse(view?.localStorage.getItem(key) ?? "null")
        } catch {
          return null
        }
      }
      const save = (key: string, value: unknown) => {
        try {
          view?.localStorage.setItem(key, JSON.stringify(value))
        } catch {
          return
        }
      }
      const feed: Feed = {
        inspector,
        origin: (session) => origins.get(session),
        changes: Stream.fromPubSub(changes),
        paintable: (session, seq) =>
          roots.has(session) && history.holds(session, seq),
        paused: () => paused?.at,
        open: load(openKey) === true
      }
      const unpause: Effect.Effect<void> = Effect.suspend(() => {
        const was = paused
        if (was === undefined) return Effect.void
        return Effect.andThen(
          was.root.resume,
          Effect.sync(() => {
            if (paused !== was) return
            paused = undefined
            lower(frame)
            changed()
          })
        )
      })
      const resume = lock.withPermit(unpause)
      const paint = (
        session: string,
        seq: number
      ): Effect.Effect<BrowserHost.Painted | undefined> =>
        lock.withPermit(Effect.uninterruptible(Effect.suspend(() => {
          const root = roots.get(session)
          const state = history.at(session, seq)
          if (root === undefined || state === undefined) return Effect.undefined
          return (paused === undefined || paused.root === root
            ? Effect.void
            : unpause).pipe(
              Effect.andThen(root.pause(state)),
              Effect.map((painted) => {
                paused = {
                  root,
                  at: {
                    session,
                    seq,
                    fellBack: painted.fellBack,
                    fallbacks: painted.fallbacks
                  }
                }
                raise(frame)
                changed()
                return painted
              })
            )
        })))
      const pages = Pages.of({
        paint,
        resume,
        clear: (sessionId) =>
          Effect.sync(() => {
            const upTo = latest.get(sessionId)
            if (paused !== undefined || upTo === undefined) return
            inspector.sessions().find((session) => session.id === sessionId)
              ?.clear()
            history.clear(sessionId, upTo)
          }),
        setOpen: (open) => Effect.sync(() => save(openKey, open))
      })
      const controllables: BrowserHost.Controllables = {
        register: (root) => {
          roots.set(root.session, root)
          PubSub.publishUnsafe(states, undefined)
          return () => {
            if (roots.get(root.session) === root) roots.delete(root.session)
            if (paused?.root === root) {
              paused = undefined
              lower(frame)
            }
            changed()
          }
        }
      }

      const position = options.position ?? "BottomRight"
      const frame = document.createElement("iframe")
      frame.setAttribute("data-effect-ui-devtools", "")
      frame.title = "Effect UI inspector"
      frame.setAttribute(
        "style",
        "position:fixed;inset:auto;" + corners[position] +
          ";z-index:2147483000;border:0;margin:0;padding:0;width:0;height:0;overflow:hidden;" +
          "background:transparent;color-scheme:light dark;max-width:none;max-height:none;" +
          "box-shadow:0 8px 28px rgb(0 0 0 / .14)"
      )
      frame.srcdoc =
        "<!doctype html><html><head><meta charset=\"utf-8\"><style>" + styles +
        "</style></head><body><div id=\"root\"></div></body></html>"
      yield* Effect.callback<void>((resume) => {
        frame.addEventListener("load", () => resume(Effect.void), {
          once: true
        })
        document.body.appendChild(frame)
      })
      yield* Effect.addFinalizer(() => Effect.sync(() => frame.remove()))
      const inner = frame.contentDocument!
      const container = inner.getElementById("root")!

      const root = inner.documentElement
      root.setAttribute("data-position", position)
      const resize = (width: number, height: number) => {
        root.style.setProperty(
          "--panel-w",
          Math.max(480, Math.round(width)) + "px"
        )
        root.style.setProperty(
          "--panel-h",
          Math.max(300, Math.round(height)) + "px"
        )
      }
      const saved = load(sizeKey)
      if (
        Array.isArray(saved) && typeof saved[0] === "number" &&
        typeof saved[1] === "number"
      ) {
        resize(saved[0], saved[1])
      }
      const grow = {
        x: position.endsWith("Right") ? -1 : 1,
        y: position.startsWith("Bottom") ? -1 : 1
      }
      container.addEventListener("pointerdown", (event) => {
        const grip = (event.target as Element).closest<HTMLElement>(".grip")
        const panel = grip?.parentElement
        if (grip == null || panel == null || event.button !== 0) return
        event.preventDefault()
        const start = {
          x: event.screenX,
          y: event.screenY,
          rect: panel.getBoundingClientRect()
        }
        const move = (moved: PointerEvent) =>
          resize(
            start.rect.width + grow.x * (moved.screenX - start.x),
            start.rect.height + grow.y * (moved.screenY - start.y)
          )
        const end = () => {
          grip.removeEventListener("pointermove", move)
          const rect = panel.getBoundingClientRect()
          save(sizeKey, [rect.width, rect.height])
        }
        grip.setPointerCapture(event.pointerId)
        grip.addEventListener("pointermove", move)
        grip.addEventListener("lostpointercapture", end, { once: true })
      })

      const viewport = () => {
        if (view === null) return
        root.style.setProperty("--vw", view.innerWidth + "px")
        root.style.setProperty("--vh", view.innerHeight + "px")
      }
      viewport()
      view?.addEventListener("resize", viewport)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => view?.removeEventListener("resize", viewport))
      )
      const Observer =
        (frame.contentWindow as (Window & typeof globalThis) | null)
          ?.ResizeObserver
      if (Observer !== undefined) {
        const observer = new Observer(() => {
          const shape = container.firstElementChild?.firstElementChild
          frame.style.width = container.offsetWidth + "px"
          frame.style.height = container.offsetHeight + "px"
          frame.style.borderRadius = shape == null
            ? "0"
            : inner.defaultView!.getComputedStyle(shape).borderRadius
        })
        observer.observe(container)
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => observer.disconnect())
        )
      }

      yield* BrowserHost.mountEffect(Overlay, { feed }, container, {
        head: false
      }).pipe(
        Effect.provideService(MessageLog.MessageLog, MessageLog.noop),
        Effect.provide(
          Layer.mergeAll(Paint.layer, Clear.layer, SaveOpen.layer).pipe(
            Layer.provide(Layer.succeed(Pages, pages))
          )
        )
      )

      const encoded = yield* MessageLog.makeEncoded((batch) =>
        Effect.suspend(() => {
          for (const entry of batch) {
            if (!origins.has(entry.session)) {
              origins.set(entry.session, entry.at)
            }
            latest.set(entry.session, entry.seq)
          }
          inspector.ingest(batch)
          return PubSub.publish(changes, undefined)
        })
      )
      const record = (entry: MessageLog.Entry) => {
        const hide = isExcluded(entry)
        if (hide) {
          let seqs = excluded.get(entry.session)
          if (seqs === undefined) excluded.set(entry.session, seqs = new Set())
          seqs.add(entry.seq)
        }
        history.record(entry, hide)
      }
      const logs = [{ enabled: true, record }, encoded]
      if (server !== undefined) {
        const sent = yield* Layer.build(
          MessageLog.socket(socketUrl(server, "/log"), { buffer: size })
        )
        logs.push(Context.get(sent, MessageLog.MessageLog))
        yield* Remote.connect(socketUrl(server, "/control"), {
          roots,
          size,
          paused: () => paused?.at,
          paintable: feed.paintable,
          paint,
          resume,
          changes: Stream.fromPubSub(states)
        })
      }
      return Context.make(MessageLog.MessageLog, MessageLog.fanoutAll(logs))
        .pipe(
          Context.add(BrowserHost.Controllables, controllables)
        )
    }).pipe(Effect.provide(Socket.layerWebSocketConstructorGlobal))
  )
