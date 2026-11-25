/**
 * A Vite plugin that runs the DevTools server beside `vite dev`, mounts the
 * DevTools inspector overlay automatically, and preserves compatible component
 * state across Vite reloads.
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
 * No changes to the app's entry module are needed in development. An agent
 * connects to `http://127.0.0.1:4774/mcp` over Streamable HTTP, which in a
 * `.mcp.json` is
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
import type * as DevTools from "../DevTools.ts"
import { metaName } from "../internal/control.ts"
import * as DevToolsServer from "./DevToolsServer.ts"
import * as hotExports from "./internal/hotExports.ts"

/**
 * Options for the DevTools overlay mounted by `plugin`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface OverlayOptions {
  readonly position?: DevTools.Position | undefined
  readonly exclude?: ReadonlyArray<string> | undefined
  readonly webMcp?: boolean | DevTools.WebMcpOptions | undefined
}

/**
 * Options for `plugin`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options extends DevToolsServer.Options {
  /**
   * Updates edited components in place and preserves compatible component
   * Models and query results across Vite full reloads during development.
   * `true` by default; pass `false` to disable.
   */
  readonly hot?: boolean | undefined
  /**
   * Mounts the DevTools inspector overlay automatically in development without
   * needing `DevTools.layer()` in the entry module. `true` by default; pass
   * `false` to disable, or pass `OverlayOptions`.
   */
  readonly overlay?: boolean | OverlayOptions | undefined
}

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
  readonly config: (config: ViteConfig) => ViteConfig | undefined
  readonly configResolved: (config: ViteConfig) => void
  readonly resolveId: (id: string) => string | undefined
  readonly load: (id: string) => string | undefined
  readonly transform: (
    this: TransformContext,
    code: string,
    id: string,
    options?: { readonly ssr?: boolean | undefined }
  ) => { readonly code: string; readonly map: null } | undefined
  readonly configureServer: (server: DevServer) => void
  readonly transformIndexHtml: () => Promise<ReadonlyArray<HtmlTag>>
}

/**
 * The part of Vite's config that `plugin` reads and sets.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ViteConfig {
  readonly experimental?:
    | { readonly hmrPartialAccept?: boolean | undefined }
    | undefined
}

/**
 * The part of a Vite plugin's `transform` context that `plugin` uses.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TransformContext {
  readonly parse: (code: string) => unknown
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
  readonly injectTo: "head" | "head-prepend"
}

const hotId = "/@effect-ui/hot"
const resolvedHotId = "\0effect-ui-hot"
const devToolsId = "/@effect-ui/devtools"
const resolvedDevToolsId = "\0effect-ui-devtools"

const hotClient = [
  "if (import.meta.hot) {",
  "  const key = Symbol.for(\"@effect/ui/hot\");",
  "  import.meta.hot.on(\"vite:beforeFullReload\", () => {",
  "    globalThis[key]?.();",
  "  });",
  "}",
  ""
].join("\n")

const devToolsClient = (options: OverlayOptions): string =>
  [
    "import { DevTools } from \"@effect/ui-devtools\";",
    `DevTools.attach(${JSON.stringify(options)});`,
    ""
  ].join("\n")

const scriptRE = /\.[cm]?[jt]sx?$/

const programOf = (
  context: TransformContext,
  code: string,
  id: string
): unknown => {
  if (
    id.startsWith("\0") || id.includes("/node_modules/") ||
    id.includes("?") || !scriptRE.test(id) ||
    code.includes("import.meta.hot")
  ) return undefined
  try {
    return context.parse(code)
  } catch {
    return undefined
  }
}

const reasonOf = (error: unknown): string =>
  Predicate.hasProperty(error, "cause") && error.cause instanceof Error
    ? error.cause.message
    : String(error)

/**
 * Starts the DevTools server when `vite dev` starts, stops it with the
 * dev server, mounts the DevTools overlay by default, and turns on hot state
 * preservation across Vite reloads.
 *
 * **Details**
 *
 * The plugin applies to `vite dev` only, not to builds, previews or Vitest.
 * It adds a `<meta>` tag with the server's URL and `size` to each HTML page
 * Vite serves, and `DevTools` reads it so the page sends its frames there and
 * takes the server's requests. When the port is taken the plugin warns, adds
 * no `<meta>` tag, and `vite dev` runs on without the server, so a page never
 * connects to a server another project started.
 *
 * Unless `overlay: false` is passed, the plugin injects a small client module
 * that attaches the DevTools inspector overlay automatically for roots mounted
 * with `BrowserHost.mount` or `HtmlHydrate.hydrate`. If the app also provides
 * `DevTools.layer()` explicitly, that layer takes over so only one overlay
 * mounts.
 *
 * Unless `hot: false` is passed, the plugin also injects a small client
 * module that listens for Vite's `vite:beforeFullReload` event so mounted
 * `@effect/ui` roots save each instance's encoded Model and query results to
 * `sessionStorage` and adopt them after the reload. Instances whose saved
 * state no longer decodes restart from `init` with a console warning.
 *
 * It also turns on Vite's `experimental.hmrPartialAccept`, unless the config
 * sets it to `false`, and adds HMR handlers for detected component exports.
 * Compatible edits redraw mounted instances without remounting, preserving
 * their Models and running subscriptions. Other edits use the reload above,
 * including edits whose new Schemas reject the current Model or props, edits
 * that replace a child, and components with queries, shared state, parts,
 * slots or a Layer.
 * Importers that use non-component exports can also trigger a reload.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const plugin = (options?: Options): Plugin => {
  const url = DevToolsServer.url(options)
  const size = Math.max(1, options?.size ?? 1_000)
  const hot = options?.hot !== false
  const overlay = options?.overlay !== false
  const overlayOptions: OverlayOptions = typeof options?.overlay === "object"
    ? options.overlay
    : {}
  const devToolsSource = overlay ? devToolsClient(overlayOptions) : undefined
  let bound = Promise.resolve(false)
  let partial = false
  return {
    name: "effect-ui-devtools",
    apply: (_, env) =>
      env.command === "serve" && env.isPreview !== true &&
      !("VITEST" in process.env),
    config: (config) =>
      hot && config.experimental?.hmrPartialAccept === undefined
        ? { experimental: { hmrPartialAccept: true } }
        : undefined,
    configResolved: (config) => {
      partial = hot && config.experimental?.hmrPartialAccept === true
    },
    resolveId: (id) =>
      hot && id === hotId
        ? resolvedHotId
        : overlay && id === devToolsId
        ? resolvedDevToolsId
        : undefined,
    load: (id) =>
      id === resolvedHotId
        ? hotClient
        : id === resolvedDevToolsId
        ? devToolsSource
        : undefined,
    transform(code, id, options) {
      if (!partial || options?.ssr === true) return undefined
      const program = programOf(this, code, id)
      if (program === undefined) return undefined
      const found = hotExports.find(program as never)
      if (found.length === 0) return undefined
      return { code: code + hotExports.footer(found), map: null }
    },
    configureServer: (server) => {
      const { logger } = server.config
      let settle: (ok: boolean) => void = () => {}
      bound = new Promise((resolve) => settle = resolve)
      const fiber = Layer.build(DevToolsServer.layer(options)).pipe(
        Effect.andThen(Effect.sync(() => {
          settle(true)
          logger.info("Effect UI DevTools: " + url)
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
    transformIndexHtml: async () => {
      const tags: Array<HtmlTag> = []
      if (await bound) {
        tags.push({
          tag: "meta",
          attrs: { name: metaName, content: JSON.stringify({ url, size }) },
          injectTo: "head"
        })
      }
      if (overlay) {
        tags.push({
          tag: "script",
          attrs: { type: "module", src: devToolsId },
          injectTo: "head-prepend"
        })
      }
      if (hot) {
        tags.push({
          tag: "script",
          attrs: { type: "module", src: hotId },
          injectTo: "head"
        })
      }
      return tags
    }
  }
}
