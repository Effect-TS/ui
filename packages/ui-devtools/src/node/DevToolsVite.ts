/**
 * A Vite plugin that runs the DevTools server beside `vite dev` and tells
 * the page where it is.
 *
 * **Example** (Adding the plugin)
 *
 * ```ts
 * import { DevToolsVite } from "@effect/ui-devtools/node"
 * import { defineConfig } from "vite"
 *
 * export default defineConfig({
 *   plugins: [DevToolsVite.plugin({ dispatch: true })]
 * })
 * ```
 *
 * The app keeps `DevTools.layer()` in development. An agent connects to
 * `http://127.0.0.1:4774/mcp` over Streamable HTTP, which in a `.mcp.json` is
 * `{ "mcpServers": { "effect-ui": { "type": "http", "url": "http://127.0.0.1:4774/mcp" } } }`.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import { metaName } from "../internal/control.ts"
import * as DevToolsServer from "./DevToolsServer.ts"

/**
 * The parts of a Vite plugin that `plugin` returns, typed without
 * importing `vite`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Plugin {
  readonly name: string
  readonly apply: (
    config: unknown,
    env: { readonly command: string; readonly isPreview?: boolean }
  ) => boolean
  readonly configureServer: (server: DevServer) => void
  readonly transformIndexHtml: () => Promise<ReadonlyArray<HtmlTag>>
}

/**
 * The parts of Vite's dev server that `plugin` uses.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface DevServer {
  readonly config: {
    readonly logger: {
      readonly info: (message: string) => void
      readonly warn: (message: string) => void
    }
  }
  readonly httpServer: {
    readonly once: (event: "close", listener: () => void) => unknown
  } | null
}

/**
 * A tag `transformIndexHtml` adds to the page.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface HtmlTag {
  readonly tag: string
  readonly attrs: Readonly<Record<string, string>>
  readonly injectTo: "head"
}

const reasonOf = (error: unknown): string =>
  Predicate.hasProperty(error, "cause") && error.cause instanceof Error
    ? error.cause.message
    : String(error)

/**
 * Starts the DevTools server when `vite dev` starts, and stops it with the
 * dev server.
 *
 * **Details**
 *
 * The plugin applies to `vite dev` only, not to builds, previews or Vitest.
 * It adds a `<meta>` tag with the server's URL and `size` to each HTML page
 * Vite serves, and `DevTools.layer` reads it, so the page sends its frames
 * there and takes the server's requests. Without `DevTools.layer` on the
 * page the plugin does nothing more. When the port is taken the plugin
 * warns, adds no tag, and `vite dev` runs on without the server, so a page
 * never connects to a server another project started.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const plugin = (options?: DevToolsServer.Options): Plugin => {
  const url = DevToolsServer.url(options)
  const size = Math.max(1, options?.size ?? 1_000)
  let bound = Promise.resolve(false)
  return {
    name: "effect-ui-devtools",
    apply: (_, env) =>
      env.command === "serve" && env.isPreview !== true &&
      !("VITEST" in process.env),
    configureServer: (server) => {
      const { logger } = server.config
      let settle: (ok: boolean) => void = () => {}
      bound = new Promise((resolve) => settle = resolve)
      const fiber = Layer.build(DevToolsServer.layer(options)).pipe(
        Effect.andThen(Effect.sync(() => {
          settle(true)
          logger.info("Effect UI DevTools MCP server: " + url + "/mcp")
        })),
        Effect.andThen(Effect.never),
        Effect.scoped,
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            settle(false)
            if (Cause.hasInterruptsOnly(cause)) return
            logger.warn(
              "Effect UI DevTools could not start on " + url + ": " +
                reasonOf(Cause.squash(cause)) +
                ". Give DevToolsVite.plugin another port."
            )
          })
        ),
        Effect.runFork
      )
      server.httpServer?.once("close", () => {
        Effect.runFork(Fiber.interrupt(fiber))
      })
    },
    transformIndexHtml: async () =>
      (await bound)
        ? [{
          tag: "meta",
          attrs: { name: metaName, content: JSON.stringify({ url, size }) },
          injectTo: "head"
        }]
        : []
  }
}
