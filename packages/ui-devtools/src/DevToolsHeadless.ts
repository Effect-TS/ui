/**
 * Sends an `@effect/ui` app's log to a DevTools server from a host with no
 * DOM, such as an OpenTUI app in a terminal.
 *
 * Run `effect-ui-devtools` and open the URL it prints to inspect the newest
 * session in a read-only browser page. This entry point does not load the
 * browser overlay in the app.
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
 * Provides a `MessageLog` that sends entries to `server`
 * (`http://127.0.0.1:4774` by default), using the global `WebSocket`.
 * The session's `host` defaults to `"terminal"`; inspection is read-only.
 *
 * Retains the last `size` entries (1,000 by default) for replay on connection,
 * so the server can start after the app. Retries lost connections with backoff.
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
    Control.socketUrl(options?.server ?? Control.serverUrl(), "/log"),
    { host: options?.host ?? "terminal", buffer: options?.size }
  ).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal))
