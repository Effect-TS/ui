import * as BrowserHost from "@effect/ui/html/BrowserHost"
import * as MessageLog from "@effect/ui/MessageLog"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import * as Stream from "effect/Stream"
import * as Inspector from "../Inspector.ts"
import * as History from "./history.ts"
import { type Feed, Overlay, Pages, Paint } from "./overlay.ts"
import { styles } from "./styles.ts"

export type Position = "TopLeft" | "TopRight" | "BottomLeft" | "BottomRight"

const sizeKey = "@effect/ui-devtools/size"

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

export const make = (options: {
  readonly position?: Position | undefined
  readonly buffer?: number | undefined
}): Layer.Layer<never> =>
  Layer.effectContext(
    Effect.gen(function*() {
      const size = Math.max(1, options.buffer ?? 1_000)
      const inspector = Inspector.make({ size })
      const history = History.make(size)
      const roots = new Map<string, BrowserHost.Pausable>()
      let paused: BrowserHost.Pausable | undefined
      const origins = new Map<string, number>()
      const changes = yield* PubSub.sliding<void>(1)
      const feed: Feed = {
        inspector,
        origin: (session) => origins.get(session),
        changes: Stream.fromPubSub(changes),
        paintable: (session, seq) => roots.has(session) && history.holds(session, seq),
        pausing: () => paused !== undefined
      }
      const resume: Effect.Effect<void> = Effect.suspend(() => {
        const root = paused
        paused = undefined
        return root === undefined ? Effect.void : Effect.andThen(root.resume, Effect.sync(() => lower(frame)))
      })
      const pages = Pages.of({
        paint: (session, seq) =>
          Effect.suspend(() => {
            const root = roots.get(session)
            const state = history.at(session, seq)
            if (root === undefined || state === undefined) return Effect.undefined
            const previous = paused
            paused = root
            return (previous === undefined || previous === root ? Effect.void : previous.resume).pipe(
              Effect.andThen(root.pause(state)),
              Effect.map((painted) => {
                raise(frame)
                return painted
              })
            )
          }),
        resume
      })
      const pausables: BrowserHost.Pausables = {
        register: (root) => {
          roots.set(root.session, root)
          return () => {
            if (roots.get(root.session) === root) roots.delete(root.session)
            if (paused !== root) return
            paused = undefined
            lower(frame)
            PubSub.publishUnsafe(changes, undefined)
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
      frame.srcdoc = "<!doctype html><html><head><meta charset=\"utf-8\"><style>" + styles +
        "</style></head><body><div id=\"root\"></div></body></html>"
      yield* Effect.callback<void>((resume) => {
        frame.addEventListener("load", () => resume(Effect.void), { once: true })
        document.body.appendChild(frame)
      })
      yield* Effect.addFinalizer(() => Effect.sync(() => frame.remove()))
      const inner = frame.contentDocument!
      const container = inner.getElementById("root")!

      const view = document.defaultView
      const root = inner.documentElement
      root.setAttribute("data-position", position)
      const resize = (width: number, height: number) => {
        root.style.setProperty("--panel-w", Math.max(480, Math.round(width)) + "px")
        root.style.setProperty("--panel-h", Math.max(300, Math.round(height)) + "px")
      }
      const saved = ((): unknown => {
        try {
          return JSON.parse(view?.localStorage.getItem(sizeKey) ?? "null")
        } catch {
          return null
        }
      })()
      if (Array.isArray(saved) && typeof saved[0] === "number" && typeof saved[1] === "number") {
        resize(saved[0], saved[1])
      }
      const grow = { x: position.endsWith("Right") ? -1 : 1, y: position.startsWith("Bottom") ? -1 : 1 }
      container.addEventListener("pointerdown", (event) => {
        const grip = (event.target as Element).closest<HTMLElement>(".grip")
        const panel = grip?.parentElement
        if (grip == null || panel == null || event.button !== 0) return
        event.preventDefault()
        const start = { x: event.screenX, y: event.screenY, rect: panel.getBoundingClientRect() }
        const move = (moved: PointerEvent) =>
          resize(
            start.rect.width + grow.x * (moved.screenX - start.x),
            start.rect.height + grow.y * (moved.screenY - start.y)
          )
        const end = () => {
          grip.removeEventListener("pointermove", move)
          const rect = panel.getBoundingClientRect()
          try {
            view?.localStorage.setItem(sizeKey, JSON.stringify([rect.width, rect.height]))
          } catch {
            return
          }
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
      yield* Effect.addFinalizer(() => Effect.sync(() => view?.removeEventListener("resize", viewport)))
      const Observer = (frame.contentWindow as (Window & typeof globalThis) | null)?.ResizeObserver
      if (Observer !== undefined) {
        const observer = new Observer(() => {
          const shape = container.firstElementChild?.firstElementChild
          frame.style.width = container.offsetWidth + "px"
          frame.style.height = container.offsetHeight + "px"
          frame.style.borderRadius = shape == null ? "0" : inner.defaultView!.getComputedStyle(shape).borderRadius
        })
        observer.observe(container)
        yield* Effect.addFinalizer(() => Effect.sync(() => observer.disconnect()))
      }

      yield* BrowserHost.mountEffect(Overlay, { feed }, container, { head: false }).pipe(
        Effect.provideService(MessageLog.MessageLog, MessageLog.noop),
        Effect.provide(Paint.layer.pipe(Layer.provide(Layer.succeed(Pages, pages))))
      )

      const encoded = yield* MessageLog.makeEncoded((batch) =>
        Effect.suspend(() => {
          for (const entry of batch) {
            if (!origins.has(entry.session)) origins.set(entry.session, entry.at)
          }
          inspector.ingest(batch)
          return PubSub.publish(changes, undefined)
        })
      )
      const log = MessageLog.fanoutAll([{ enabled: true, record: history.record }, encoded])
      return Context.make(MessageLog.MessageLog, log).pipe(Context.add(BrowserHost.Pausables, pausables))
    })
  )
