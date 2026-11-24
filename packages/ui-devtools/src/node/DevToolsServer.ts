/**
 * A local server that lets an agent inspect and control a running
 * `@effect/ui` app over MCP.
 *
 * Pages that build `DevTools.layer` with the server's URL send it their
 * `MessageLog` as Wire frames on `/log`, and take requests on `/control`.
 * Any process can send frames to `/log` with `MessageLog.socket`, so a
 * server render shows up as a session too. Agents connect to `/mcp`, a
 * Streamable HTTP MCP endpoint.
 *
 * The server holds an `Inspector` of its own, so the read tools answer from
 * its copy of the log: they keep working after the tab reloads or closes, and
 * cover server-rendered sessions. The control tools go to the page.
 *
 * | Tool | Does |
 * | --- | --- |
 * | `list_sessions` | the sessions held, whether each is connected, controllable and paused |
 * | `list_instances` | the instances of a session, with the state of their Command runs |
 * | `list_entries` | entries as rows without payloads |
 * | `count_entries` | entries by entry and message `_tag` |
 * | `get_entry` | one entry's Wire frame |
 * | `get_chain` | the causal chain of an entry |
 * | `get_state` | an instance's Model, props and query results, now or at an entry |
 * | `diff_state` | what an entry changed in its instance's Model |
 * | `show_entry` | paints the page as it was at an entry |
 * | `resume` | shows the live page again |
 * | `get_message_schema` | the JSON Schema of the messages an instance accepts |
 * | `dispatch` | sends messages to an instance, when `dispatch` is on |
 * | `wait` | waits for the Command runs started since an entry to end |
 *
 * **Example** (Running the server without Vite)
 *
 * ```ts
 * import { NodeRuntime } from "@effect/platform-node"
 * import { DevToolsServer } from "@effect/ui-devtools/node"
 * import { Layer } from "effect"
 *
 * NodeRuntime.runMain(Layer.launch(DevToolsServer.layer({ dispatch: true })))
 * ```
 *
 * The page then needs the URL: `DevTools.layer({ server: "http://127.0.0.1:4774" })`.
 * The `effect-ui-devtools` bin runs the same server.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import * as Effect from "effect/Effect"
import * as HttpRouter from "effect/http/HttpRouter"
import type * as HttpServerError from "effect/http/HttpServerError"
import * as Layer from "effect/Layer"
import { createServer } from "node:http"
import * as Server from "../internal/server.ts"
import * as Tools from "../internal/tools.ts"

/**
 * The port the server listens on unless told otherwise. It's fixed, so a
 * project can commit the MCP entry that points at it.
 *
 * @stability experimental
 * @category constants
 * @since 0.1.0
 */
export const defaultPort = 4774

/**
 * Options for `layer`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  /** The port, `defaultPort` by default. */
  readonly port?: number | undefined
  /** The interface to listen on, `127.0.0.1` by default. */
  readonly host?: string | undefined
  /**
   * The entries kept per session, 1,000 by default. Give pages the same
   * `size` in `DevTools.layer`, or `show_entry` lists entries a page can no
   * longer paint.
   */
  readonly size?: number | undefined
  /**
   * Whether the `dispatch` tool may send messages. Off by default: dispatch
   * runs `update` and the real Commands it returns.
   */
  readonly dispatch?: boolean | undefined
  /** How many closed sessions are kept, 5 by default. */
  readonly keep?: number | undefined
}

/**
 * Serves `/mcp`, `/log` and `/control` on `host` and `port`.
 *
 * **Details**
 *
 * `/mcp` rejects requests that carry an `Origin` header, and the WebSocket
 * routes accept only loopback origins, so a web page cannot reach the tools
 * or pose as an app. There is no token: any local user can connect, as they
 * can to a Vite dev server.
 *
 * A session is one mounted root, so a reload starts a new one. Tools that
 * take a `session` default to the newest connected one. A session can be
 * controlled while the tab that mounted it is open.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (
  options?: Options
): Layer.Layer<never, HttpServerError.ServeError> =>
  Layer.unwrap(Effect.sync(() => {
    const { routes, server } = Server.make({
      size: Math.max(1, options?.size ?? 1_000),
      dispatch: options?.dispatch ?? false,
      keep: Math.max(0, options?.keep ?? 5)
    })
    return HttpRouter.serve(Layer.mergeAll(routes, Tools.layer(server)), {
      disableLogger: true,
      disableListenLog: true
    }).pipe(
      Layer.provide(
        NodeHttpServer.layer(createServer, {
          port: options?.port ?? defaultPort,
          host: options?.host ?? "127.0.0.1"
        })
      )
    )
  }))

/**
 * The URL a page and an MCP client use for a server started with these
 * options. Add `/mcp` for the MCP endpoint.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const url = (options?: Pick<Options, "host" | "port">): string => {
  const host = options?.host ?? "127.0.0.1"
  return "http://" + (host.includes(":") ? "[" + host + "]" : host) + ":" +
    (options?.port ?? defaultPort)
}
