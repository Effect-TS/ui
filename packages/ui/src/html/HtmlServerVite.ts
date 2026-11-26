/**
 * A Vite plugin that renders an `@effect/ui` app on the server in
 * `vite dev` and prerenders its pages in `vite build`.
 *
 * It is a separate entry point, `@effect/ui/html/HtmlServerVite`, and
 * `@effect/ui/html` doesn't re-export it. It runs in Vite's Node process.
 *
 * The app's server entry exports a `default` Layer that adds its routes to
 * `HttpRouter`, such as `HtmlServerHttp.layerHttp`, and `prerender`, the
 * paths to prerender, as an array or an Effect of one. It renders its pages
 * with `document` from `virtual:@effect/ui/document`, which fills
 * `index.html` with `HtmlServer.document`. Add
 * `@effect/ui/html/HtmlServerViteDocument` to `compilerOptions.types` for
 * that module's types. `index.html` holds the static markup and the
 * `<!--app-html-->` marker where the page goes.
 *
 * In dev, Vite answers module, asset and `/@vite` requests first, and every
 * other request goes to the server entry. The template is `index.html`
 * after Vite's HTML transforms. Editing a module or `index.html` reloads
 * the server entry on the next request.
 *
 * In a build, it builds the client, then the server entry, using the
 * client's `index.html` as the template. It requests each `prerender`
 * path at `origin` and writes a 200 to `<path>.html`, or `index.html`
 * for a path ending in `/`, and a 404 to `404.html`. Any other status
 * fails the build. The server build isn't kept.
 *
 * **Example** (Configuring the plugin)
 *
 * ```ts
 * import { plugin } from "@effect/ui/html/HtmlServerVite"
 *
 * // vite.config.ts: export default { plugins: [ssr] }
 * const ssr = plugin({ entry: "/src/entry.server.ts" })
 *
 * // src/entry.server.ts:
 * //
 * // import { document } from "virtual:@effect/ui/document"
 * // export default layerHttp(App, { routes: AppRoute, document, static: import.meta.env.PROD })
 * // export const prerender = [AppRoute.print(AppRoute.Home())]
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as fs from "node:fs/promises"
import type * as Http from "node:http"
import * as path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream as WebStream } from "node:stream/web"
import { pathToFileURL } from "node:url"

/**
 * The options of `plugin`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  /** The server entry, as a Vite module id such as `"/src/entry.server.ts"`. */
  readonly entry: string
  /** The origin prerendered pages are requested at. Defaults to `"http://localhost"`. */
  readonly origin?: string | undefined
}

/**
 * The subset of a Vite plugin that `plugin` returns. It is assignable to
 * Vite's `Plugin` without importing `vite`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Plugin {
  readonly name: string
  readonly sharedDuringBuild: true
  config(
    config: unknown,
    env: { readonly command: string; readonly isPreview?: boolean | undefined }
  ): object
  resolveId(source: string): string | undefined
  load(this: LoadContext, id: string): Promise<string | undefined>
  configureServer(server: DevServer): () => void
  writeBundle(
    this: { readonly environment: { readonly name: string } },
    options: unknown,
    bundle: { readonly [fileName: string]: OutputFile }
  ): void
  buildApp(builder: Builder): Promise<void>
  buildEnd(): Promise<void>
}

interface LoadContext {
  addWatchFile(file: string): void
}

interface OutputFile {
  readonly type: "asset" | "chunk"
  readonly fileName: string
  readonly isEntry?: boolean
  readonly code?: string
  readonly source?: string | Uint8Array
}

interface DevServer {
  readonly config: { readonly root: string }
  readonly middlewares: {
    use(
      handler: (
        request: Http.IncomingMessage,
        response: Http.ServerResponse,
        next: (error?: unknown) => void
      ) => void
    ): unknown
  }
  readonly environments: {
    readonly ssr: {
      readonly runner?: { import(url: string): Promise<unknown> }
    }
  }
  transformIndexHtml(url: string, html: string): Promise<string>
}

interface Environment {
  readonly config: {
    readonly root: string
    readonly cacheDir: string
    readonly build: { readonly outDir: string }
  }
}

interface Builder {
  readonly environments: { readonly [name: string]: Environment }
  build(environment: Environment): Promise<unknown>
}

/** What the virtual server module exports. */
interface ServerModule {
  readonly handler: (request: Request) => Promise<Response>
  readonly dispose: () => Promise<void>
  readonly prerender: () => Promise<ReadonlyArray<string>>
}

const documentId = "virtual:@effect/ui/document"
const serverId = "virtual:@effect/ui/server"

/**
 * Creates the Vite plugin.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const plugin = (options: Options): Plugin => {
  const origin = options.origin ?? "http://localhost"
  let devServer: DevServer | undefined
  let builtTemplate: string | undefined
  let current: ServerModule | undefined

  const template = async (context: LoadContext): Promise<string> => {
    if (devServer !== undefined) {
      const file = path.join(devServer.config.root, "index.html")
      context.addWatchFile(file)
      return devServer.transformIndexHtml("/", await fs.readFile(file, "utf8"))
    }
    if (builtTemplate === undefined) {
      throw new Error(`${documentId} needs the client build's index.html`)
    }
    return builtTemplate
  }

  return {
    name: "effect-ui-html-server",
    // The server build reads the template the client build captured.
    sharedDuringBuild: true,
    config: (_, { command, isPreview }) => ({
      // In dev, page requests that Vite doesn't answer reach the server
      // entry. A preview serves `/about` from `about.html`.
      appType: command === "serve" && !isPreview ? "custom" : "mpa",
      builder: {},
      ssr: { noExternal: [/^@effect\/ui/] },
      environments: {
        ssr: {
          build: { write: false, rolldownOptions: { input: serverId } }
        }
      }
    }),
    resolveId: (source) =>
      source === documentId || source === serverId ? `\0${source}` : undefined,
    async load(id) {
      if (id === `\0${documentId}`) {
        return [
          `import { document as fill } from "@effect/ui/html/HtmlServer"`,
          `const template = ${JSON.stringify(await template(this))}`,
          `export const document = (rendered) => fill(template, rendered)`
        ].join("\n")
      }
      if (id === `\0${serverId}`) {
        return [
          `import * as entry from ${JSON.stringify(options.entry)}`,
          `import { isEffect, runPromise } from "effect/Effect"`,
          `import { toWebHandler } from "effect/http/HttpRouter"`,
          `export const { handler, dispose } = toWebHandler(entry.default, { disableLogger: true })`,
          `export const prerender = async () => isEffect(entry.prerender) ? runPromise(entry.prerender) : entry.prerender ?? []`
        ].join("\n")
      }
      return undefined
    },
    configureServer(server) {
      devServer = server
      const load = async () => {
        const runner = server.environments.ssr.runner
        if (runner === undefined) {
          throw new Error("HtmlServerVite needs a runnable ssr environment")
        }
        const module = (await runner.import(serverId)) as ServerModule
        // An edit re-evaluates the server entry, with a new handler.
        if (module !== current) {
          const previous = current
          current = module
          await previous?.dispose()
        }
        return module
      }
      // Returned, so it runs after Vite's own middlewares.
      return () => {
        server.middlewares.use((request, response, next) => {
          load()
            .then((module) => module.handler(toRequest(request)))
            .then((answer) => send(response, answer))
            .catch(next)
        })
      }
    },
    writeBundle(_, bundle) {
      const html = bundle["index.html"]
      if (this.environment.name === "client" && html?.type === "asset") {
        builtTemplate = String(html.source)
      }
    },
    async buildApp(builder) {
      const { client, ssr } = builder.environments
      await builder.build(client)
      const output = (await builder.build(ssr)) as {
        readonly output: ReadonlyArray<OutputFile>
      }
      const { cacheDir, root } = ssr.config
      await fs.mkdir(cacheDir, { recursive: true })
      // Inside the project, so the bundle's external imports resolve.
      const dir = await fs.mkdtemp(path.join(cacheDir, "effect-ui-server-"))
      try {
        await Promise.all(
          output.output.map((file) =>
            write(dir, file.fileName, file.code ?? file.source ?? "")
          )
        )
        const entry = output.output.find((file) => file.isEntry)!
        const module = (await import(
          pathToFileURL(path.join(dir, entry.fileName)).href
        )) as ServerModule
        try {
          const outDir = path.resolve(root, client.config.build.outDir)
          await Promise.all(
            (await module.prerender()).map(async (url) => {
              const response = await module.handler(
                new Request(new URL(url, origin))
              )
              await write(
                outDir,
                fileName(url, response.status),
                await response.text()
              )
            })
          )
        } finally {
          await module.dispose()
        }
      } finally {
        await fs.rm(dir, { recursive: true, force: true })
      }
    },
    async buildEnd() {
      const previous = current
      current = undefined
      await previous?.dispose()
    }
  }
}

const fileName = (url: string, status: number): string => {
  if (status === 404) {
    return "404.html"
  }
  if (status !== 200) {
    throw new Error(`Prerendering ${url} answered ${status}`)
  }
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname)
  return pathname.endsWith("/") ? `${pathname}index.html` : `${pathname}.html`
}

const write = async (
  dir: string,
  file: string,
  content: string | Uint8Array
) => {
  const target = path.join(dir, file)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content)
}

const toRequest = (request: Http.IncomingMessage): Request => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || name.startsWith(":")) continue
    for (const item of Array.isArray(value) ? value : [value]) {
      headers.append(name, item)
    }
  }
  const method = request.method ?? "GET"
  const protocol = "encrypted" in request.socket ? "https" : "http"
  return new Request(
    new URL(request.url ?? "/", `${protocol}://${request.headers.host}`),
    {
      method,
      headers,
      ...(method === "GET" || method === "HEAD" ? {} : {
        body: Readable.toWeb(request) as ReadableStream,
        duplex: "half"
      })
    } as RequestInit
  )
}

const send = async (response: Http.ServerResponse, answer: Response) => {
  response.statusCode = answer.status
  response.setHeaders(answer.headers)
  if (answer.body === null) {
    response.end()
  } else {
    await pipeline(Readable.fromWeb(answer.body as WebStream), response)
  }
}
