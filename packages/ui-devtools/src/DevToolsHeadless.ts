/**
 * Sends an `@effect/ui` app's log to a DevTools server from a host with no
 * DOM, such as an OpenTUI app in a terminal.
 *
 * The server shows every session it holds on a page at its URL, so the app
 * can be inspected in a browser while it runs in the terminal. Start the
 * server with the `effect-ui-devtools` bin, or `DevToolsServer.layer` from
 * `@effect/ui-devtools/node`, and open the URL it prints.
 *
 * This module isn't in the package's index, so an app that imports it never
 * loads the browser overlay.
 *
 * **Example** (Inspecting an OpenTUI app)
 *
 * ```ts
 * import { NodeRuntime } from "@effect/platform-node"
 * import * as DevToolsHeadless from "@effect/ui-devtools/DevToolsHeadless"
 * import { OpenTui, OpenTuiHost } from "@effect/ui-opentui"
 * import { Effect, Schema } from "effect"
 *
 * const App = OpenTui.component({
 *   name: "App",
 *   model: Schema.Struct({}),
 *   message: Schema.Never
 * }).make({
 *   init: () => ({}),
 *   update: (model) => model,
 *   view: (h) => h.text("Hello")
 * })
 *
 * OpenTuiHost.run(App, {}).pipe(
 *   Effect.provide(DevToolsHeadless.layer()),
 *   NodeRuntime.runMain
 * )
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as MessageLog from "@effect/ui/MessageLog"
import * as Layer from "effect/Layer"
import * as Socket from "effect/socket/Socket"
import * as Control from "./internal/control.ts"

/**
 * Provides the `MessageLog` with one that sends the app's entries to the
 * DevTools server at `server`, `http://127.0.0.1:4774` by default.
 *
 * **Details**
 *
 * It's `MessageLog.socket` on the server's `/log` route, with the global
 * `WebSocket`, so it runs on Node 22 and later, Bun and Deno. The session is
 * listed with `host`, `"terminal"` by default. The server and its page can
 * read the session, but not pause it or dispatch to it.
 *
 * The Layer keeps the last `size` entries (1,000 by default) and sends them
 * when it connects, so the server can start after the app. A lost
 * connection is retried with backoff, and one warning is logged.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (options?: {
  readonly server?: string | undefined
  readonly host?: MessageLog.WireHost | undefined
  readonly size?: number | undefined
}): Layer.Layer<never> =>
  MessageLog.socket(
    Control.socketUrl(
      options?.server ?? "http://127.0.0.1:" + Control.defaultPort,
      "/log"
    ),
    { host: options?.host ?? "terminal", buffer: options?.size }
  ).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal))
