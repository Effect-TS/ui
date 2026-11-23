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
 * `HtmlSubscription.onDocument` or `onWindow` listeners. It reads Wire frames only, so a
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
import type * as Layer from "effect/Layer"
import * as internal from "./internal/layer.ts"

/**
 * The corner of the page the overlay sits in.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Position = internal.Position

/**
 * Provides the `MessageLog` with a log that feeds the inspector overlay, and
 * mounts the overlay for as long as the Layer is built.
 *
 * **Details**
 *
 * The overlay starts closed, as a button at `position` (`"BottomRight"` by
 * default) that opens it. It's mounted in an iframe added to the end of
 * `document.body` and removed when the Layer closes, so the app's DOM is
 * left as it is. The iframe takes the size and shape of the launcher or the
 * open panel, so the page around them still gets its clicks, and its theme
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
  internal.make({ position: options?.position })
