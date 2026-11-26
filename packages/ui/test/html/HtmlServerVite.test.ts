import { plugin } from "@effect/ui/html/HtmlServerVite"
import { describe, expect, it } from "@effect/vitest"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import {
  createBuilder,
  createServer,
  type InlineConfig,
  type Plugin
} from "vite"
import type { Gates } from "./fixtures/vite/src/entry.lifecycle.ts"

const config = (overrides: InlineConfig = {}): InlineConfig => ({
  root: path.join(import.meta.dirname, "fixtures", "vite"),
  configFile: false,
  logLevel: "silent",
  resolve: { tsconfigPaths: true },
  plugins: [plugin({ entry: "/src/entry.server.ts" })],
  ...overrides
})

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("HtmlServerVite.plugin", () => {
  it(
    "renders pages through the server entry in dev and leaves modules to Vite",
    async () => {
      const server = await createServer(
        config({ server: { port: 0, strictPort: false } })
      )
      await server.listen()
      try {
        const origin = server.resolvedUrls!.local[0]!
        const get = (url: string) => fetch(new URL(url, origin))

        const home = await get("/")
        expect(home.status).toBe(200)
        const html = await home.text()
        expect(html).toContain("<h1>Home</h1>")
        expect(html).toContain("/@vite/client")
        expect(html).toContain(
          "<script type=\"application/json\" id=\"state\">"
        )

        const missing = await get("/nowhere")
        expect(missing.status).toBe(404)
        expect(await missing.text()).toContain("<h1>Not found</h1>")

        const module = await get("/src/entry.client.ts")
        expect(module.status).toBe(200)
        expect(module.headers.get("content-type")).toContain("javascript")
      } finally {
        await server.close()
      }
    },
    60_000
  )

  it("prerenders the server entry's pages into the client build", async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "html-server-vite-"))
    try {
      const builder = await createBuilder(
        config({ build: { outDir, emptyOutDir: true } })
      )
      await builder.buildApp()
      const page = (file: string) =>
        fs.readFile(path.join(outDir, file), "utf8")

      const home = await page("index.html")
      expect(home).toContain("<h1>Home</h1>")
      expect(home).toMatch(
        /<script type="module" crossorigin src="\/assets\/[^"]+\.js">/
      )
      expect(home).toMatch(
        /<link rel="stylesheet" crossorigin href="\/assets\/[^"]+\.css">/
      )
      expect(home).toContain("<script type=\"application/json\" id=\"state\">")
      expect(await page("people/1.html")).toContain("Bio of person 1")
      expect(await page("404.html")).toContain("<h1>Not found</h1>")
    } finally {
      await fs.rm(outDir, { recursive: true, force: true })
    }
  }, 60_000)

  it(
    "disposes a replaced server entry once its requests end, and waits for it on close",
    async () => {
      const evaluating = deferred()
      const resume = deferred()
      const reevaluated = deferred()
      const finalizing = [
        deferred(),
        deferred()
      ]
      const finish = deferred()
      const events: Array<string> = []
      let evaluations = 0
      const gates: Gates = {
        evaluate: async () => {
          const version = ++evaluations
          if (version === 1) {
            evaluating.resolve()
            await resume.promise
          } else {
            reevaluated.resolve()
          }
          return version
        },
        finalize: async (version) => {
          finalizing[version - 1]!.resolve()
          if (version === 2) await finish.promise
          events.push(`finalized v${version}`)
        }
      }
      ;(globalThis as any)[Symbol.for("test/HtmlServerVite/gates")] = gates
      // Sees the first response close on the server, before the plugin does.
      const firstClosed = deferred()
      const closes: Plugin = {
        name: "closes",
        configureServer: (server) => {
          server.middlewares.use((_, response, next) => {
            response.once("close", () => firstClosed.resolve())
            next()
          })
        }
      }
      const server = await createServer(config({
        server: { port: 0, strictPort: false },
        plugins: [closes, plugin({ entry: "/src/entry.lifecycle.ts" })]
      }))
      await server.listen()
      const origin = server.resolvedUrls!.local[0]!
      const get = async () => (await fetch(origin)).text()

      // A client that leaves while the entry is still evaluating.
      const leaving = new AbortController()
      const left = fetch(origin, { signal: leaving.signal }).catch(() => {})
      await evaluating.promise
      leaving.abort()
      await left
      await firstClosed.promise
      resume.resolve()
      expect(await get()).toBe("v1")

      const ssr = server.environments.ssr
      const entry = await ssr.moduleGraph.getModuleByUrl(
        "/src/entry.lifecycle.ts"
      )
      await ssr.reloadModule(entry!)
      await reevaluated.promise
      expect(await get()).toBe("v2")
      await finalizing[0]!.promise

      // Lets v2's finalizer finish only once the HTTP server has closed.
      once(server.httpServer!, "close").then(() =>
        setImmediate(() => finish.resolve())
      )
      const closing = server.close().then(() => events.push("closed"))
      await finalizing[1]!.promise
      await closing
      expect(events).toEqual(["finalized v1", "finalized v2", "closed"])
    },
    60_000
  )
})
