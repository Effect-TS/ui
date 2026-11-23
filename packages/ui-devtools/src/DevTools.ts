/**
 * A read-only inspector overlay for an `@effect/ui` app in the browser.
 *
 * `layer` takes the app's `MessageLog` slot. It feeds the app's log entries,
 * as Wire frames, to an `Inspector`, and mounts the overlay in an iframe at
 * a corner of the page. The overlay shows the timeline, the instances with
 * the state of their Command runs, the causal chain of the selected entry,
 * its Model with what changed, its message, Commands and raw frame, and the
 * Layer builds, Subscriptions, mounts and Command runs of its instance.
 *
 * The overlay is an Effect UI component tree in its own document, mounted
 * with `MessageLog.noop`: it never records its own updates, the page's
 * styles don't reach it, and its input never reaches the app's
 * `DomSubscription.onDocument` or `onWindow` listeners. It reads Wire frames only, so a
 * `Schema.Redacted` value reaches it, and a copied frame, as the encoder's
 * placeholder. It keeps frames in memory only.
 *
 * **Example** (Adding the overlay in development)
 *
 * ```ts
 * import { Component } from "@effect/ui"
 * import { BrowserHost, Html } from "@effect/ui/html"
 * import { DevTools } from "@effect/ui-devtools"
 * import { Effect, Layer, Schema } from "effect"
 *
 * const App = Component.define({
 *   name: "App",
 *   scoped: false,
 *   model: Schema.Struct({}),
 *   message: Schema.Never,
 *   elements: Html
 * }).make({
 *   init: () => ({}),
 *   update: (model) => model,
 *   view: (_, h) => h.h1("Hello")
 * })
 *
 * const Main = BrowserHost.mount(App, {}, document.getElementById("app")!).pipe(
 *   Layer.provide(import.meta.env.DEV ? DevTools.layer({ position: "BottomRight" }) : Layer.empty)
 * )
 *
 * Effect.runFork(Layer.launch(Main))
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as BrowserHost from "@effect/ui/html/BrowserHost"
import * as MessageLog from "@effect/ui/MessageLog"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import * as Stream from "effect/Stream"
import * as Inspector from "./Inspector.ts"
import { type Feed, Overlay } from "./internal/overlay.ts"
import { styles } from "./internal/styles.ts"

/**
 * The corner of the page the overlay sits in.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Position = "TopLeft" | "TopRight" | "BottomLeft" | "BottomRight"

const corners: { readonly [P in Position]: string } = {
  TopLeft: "top:0;left:0",
  TopRight: "top:0;right:0",
  BottomLeft: "bottom:0;left:0",
  BottomRight: "bottom:0;right:0"
}

/**
 * Provides the `MessageLog` with a log that feeds the inspector overlay, and
 * mounts the overlay for as long as the Layer is built.
 *
 * **Details**
 *
 * The overlay starts closed, as a button at `position` (`"BottomRight"` by
 * default) that opens it. It's mounted in an iframe added to the end of
 * `document.body` and removed when the Layer closes, so the app's DOM is
 * left as it is. The iframe is sized to the overlay, and its theme follows
 * `prefers-color-scheme`.
 *
 * Entries are queued by `record` and encoded off the app's update path by
 * `MessageLog.makeEncoded`. The inspector keeps the last `buffer` entries
 * of each session, 1,000 by default. To send entries to another sink as
 * well, combine both with `MessageLog.fanout`.
 *
 * Browser only: building the Layer needs `document`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (options?: {
  readonly position?: Position | undefined
  readonly buffer?: number | undefined
}): Layer.Layer<never> =>
  Layer.effect(
    MessageLog.MessageLog,
    Effect.gen(function*() {
      const inspector = Inspector.make({ size: options?.buffer })
      const origins = new Map<string, number>()
      const changes = yield* PubSub.sliding<void>(1)
      const feed: Feed = {
        inspector,
        origin: (session) => origins.get(session),
        changes: Stream.fromPubSub(changes)
      }

      const frame = document.createElement("iframe")
      frame.setAttribute("data-effect-ui-devtools", "")
      frame.title = "Effect UI inspector"
      frame.setAttribute(
        "style",
        "position:fixed;" + corners[options?.position ?? "BottomRight"] +
          ";z-index:2147483000;border:0;margin:0;padding:0;width:160px;height:64px;" +
          "background:transparent;color-scheme:light dark;max-width:none;max-height:none"
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
      const viewport = () => {
        if (view === null) return
        inner.documentElement.style.setProperty("--vw", view.innerWidth + "px")
        inner.documentElement.style.setProperty("--vh", view.innerHeight + "px")
      }
      viewport()
      view?.addEventListener("resize", viewport)
      yield* Effect.addFinalizer(() => Effect.sync(() => view?.removeEventListener("resize", viewport)))
      const Observer = (frame.contentWindow as (Window & typeof globalThis) | null)?.ResizeObserver
      if (Observer !== undefined) {
        const observer = new Observer(() => {
          frame.style.width = container.offsetWidth + "px"
          frame.style.height = container.offsetHeight + "px"
        })
        observer.observe(container)
        yield* Effect.addFinalizer(() => Effect.sync(() => observer.disconnect()))
      }

      yield* BrowserHost.mountEffect(Overlay, { feed }, container, { head: false }).pipe(
        Effect.provideService(MessageLog.MessageLog, MessageLog.noop)
      )

      return yield* MessageLog.makeEncoded((batch) =>
        Effect.suspend(() => {
          for (const entry of batch) {
            if (!origins.has(entry.session)) origins.set(entry.session, entry.at)
          }
          inspector.ingest(batch)
          return PubSub.publish(changes, undefined)
        })
      )
    })
  )
