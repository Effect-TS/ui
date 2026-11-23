/**
 * A read-only inspector overlay for an `@effect/ui` app in the browser.
 *
 * `layer` takes the app's `MessageLog` slot. It feeds the app's log entries,
 * as Wire frames, to an `Inspector`, and mounts the overlay in a shadow root
 * at a corner of the page. The overlay shows the timeline, the instances with
 * the state of their Command runs, the causal chain of the selected entry,
 * its Model with what changed, its message, Commands and raw frame, and the
 * Layer builds, Subscriptions, mounts and Command runs of its instance.
 *
 * The overlay is an Effect UI component tree mounted with `MessageLog.noop`,
 * so it never records its own updates. It reads Wire frames only, so a
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

/**
 * Provides the `MessageLog` with a log that feeds the inspector overlay, and
 * mounts the overlay for as long as the Layer is built.
 *
 * **Details**
 *
 * The overlay starts closed, as a button at `position` (`"BottomRight"` by
 * default) that opens it. It's mounted in a shadow root on a `<div>` added
 * to the end of `document.body` and removed when the Layer closes, so the
 * page's styles don't reach it and the app's DOM is left as it is. Its theme
 * follows `prefers-color-scheme`.
 *
 * Entries are queued by `record` and encoded off the app's update path by
 * `MessageLog.makeEncoded`. The inspector keeps the last 1,000 entries of
 * each session. To send entries to another sink as well, combine both with
 * `MessageLog.fanout`.
 *
 * Browser only: building the Layer needs `document`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (options?: { readonly position?: Position | undefined }): Layer.Layer<never> =>
  Layer.effect(
    MessageLog.MessageLog,
    Effect.gen(function*() {
      const inspector = Inspector.make()
      const origins = new Map<string, number>()
      const changes = yield* PubSub.sliding<void>(1)
      const feed: Feed = {
        inspector,
        origin: (session) => origins.get(session),
        changes: Stream.fromPubSub(changes)
      }

      const host = document.createElement("div")
      host.setAttribute("data-effect-ui-devtools", "")
      const shadow = host.attachShadow({ mode: "open" })
      const style = document.createElement("style")
      style.textContent = styles
      const container = document.createElement("div")
      shadow.append(style, container)
      document.body.appendChild(host)
      yield* Effect.addFinalizer(() => Effect.sync(() => host.remove()))

      yield* BrowserHost.mountEffect(Overlay, { feed, position: options?.position ?? "BottomRight" }, container, {
        head: false
      }).pipe(Effect.provideService(MessageLog.MessageLog, MessageLog.noop))

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
