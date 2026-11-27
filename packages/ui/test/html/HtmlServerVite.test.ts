import { HtmlServer } from "@effect/ui/html"
import { plugin } from "@effect/ui/html/HtmlServerVite"
import { describe, expect, it, vi } from "@effect/vitest"
import { Context, Logger } from "effect"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { pathToFileURL } from "node:url"
import {
  createBuilder,
  createServer,
  type InlineConfig,
  type Plugin
} from "vite"
import type { Gates } from "./fixtures/vite/src/entry.lifecycle.ts"

const fixtureRoot = path.join(import.meta.dirname, "fixtures", "vite")

const config = (overrides: InlineConfig = {}): InlineConfig => ({
  root: fixtureRoot,
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

        const missing = await get("/nowhere")
        expect(missing.status).toBe(404)
        expect(await missing.text()).toContain("<h1>Not found</h1>")

        const module = await get("/src/entry.client.ts")
        expect(module.status).toBe(200)
        expect(module.headers.get("content-type")).toContain("javascript")

        // Closing the old server leaves the restarted one serving pages.
        await server.restart()
        const restarted = await get("/")
        expect(restarted.status).toBe(200)
        expect(await restarted.text()).toContain("<h1>Home</h1>")
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
      expect(await page("people/1.html")).toContain("Bio of person 1")
      expect(await page("404.html")).toContain("<h1>Not found</h1>")
    } finally {
      await fs.rm(outDir, { recursive: true, force: true })
    }
  }, 60_000)

  it(
    "emits a web handler into serverOutDir alongside prerendered pages",
    async () => {
      const dir = await fs.mkdtemp(path.join(fixtureRoot, ".out-"))
      const publicDir = path.join(dir, "public")
      const clientOutDir = path.join(dir, "client")
      const serverOutDir = path.join(dir, "server")
      try {
        await fs.mkdir(publicDir, { recursive: true })
        await fs.writeFile(path.join(publicDir, "robots.txt"), "User-agent: *\n")
        const builder = await createBuilder(
          config({
            publicDir,
            build: { outDir: clientOutDir, emptyOutDir: true },
            plugins: [plugin({ entry: "/src/entry.server.ts", serverOutDir })]
          })
        )
        await builder.buildApp()

        expect(
          await fs.readFile(path.join(clientOutDir, "robots.txt"), "utf8")
        ).toBe("User-agent: *\n")
        await expect(
          fs.access(path.join(serverOutDir, "robots.txt"))
        ).rejects.toThrow()

        const home = await fs.readFile(
          path.join(clientOutDir, "index.html"),
          "utf8"
        )
        expect(home).toContain("\"~static\":true")

        const dts = await fs.readFile(
          path.join(serverOutDir, "index.d.ts"),
          "utf8"
        )
        expect(dts).toContain("handler")
        expect(dts).toContain("dispose")

        const server = (await import(
          pathToFileURL(path.join(serverOutDir, "index.js")).href
        )) as {
          readonly handler: (
            request: Request,
            context?: Context.Context<never>
          ) => Promise<Response>
          readonly dispose: () => Promise<void>
        }
        try {
          const live = await server.handler(
            new Request("http://localhost/people/2")
          )
          expect(live.status).toBe(200)
          const html = await live.text()
          expect(html).toContain("Bio of person 2")
          expect(html).toMatch(
            /<script type="module" crossorigin src="\/assets\/[^"]+\.js">/
          )
          expect(html).not.toContain("\"~static\"")

          const logs: Array<unknown> = []
          const staticLive = await server.handler(
            new Request("http://localhost/people/2"),
            Context.add(
              HtmlServer.Static.context(true),
              Logger.CurrentLoggers,
              new Set([Logger.make(({ message }) => {
                logs.push(message)
              })])
            )
          )
          expect(await staticLive.text()).toContain("\"~static\":true")
          expect(logs.length).toBeGreaterThan(0)

          const missing = await server.handler(
            new Request("http://localhost/nowhere")
          )
          expect(missing.status).toBe(404)
          expect(await missing.text()).toContain("<h1>Not found</h1>")
        } finally {
          await server.dispose()
        }
      } finally {
        await fs.rm(dir, { recursive: true, force: true })
      }
    },
    60_000
  )

  it(
    "rejects overlapping serverOutDir and client outDir before building either environment",
    async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "html-server-vite-"))
      try {
        const realClient = path.join(dir, "client")
        const linkedClient = path.join(dir, "client-link")
        await fs.mkdir(realClient, { recursive: true })
        await fs.symlink(realClient, linkedClient)

        const cases: ReadonlyArray<InlineConfig> = [
          {
            build: { outDir: "dist/client" },
            plugins: [
              plugin({ entry: "/src/entry.server.ts", serverOutDir: "dist" })
            ]
          },
          {
            build: { outDir: realClient },
            plugins: [
              plugin({
                entry: "/src/entry.server.ts",
                serverOutDir: path.join(linkedClient, "server")
              })
            ]
          },
          {
            build: { outDir: "dist/client" },
            environments: {
              ssr: {
                build: { rolldownOptions: { output: { dir: "dist/client" } } }
              }
            },
            plugins: [
              plugin({
                entry: "/src/entry.server.ts",
                serverOutDir: "dist/server"
              })
            ]
          }
        ]
        for (const overrides of cases) {
          const builder = await createBuilder(config(overrides))
          const build = vi
            .spyOn(builder, "build")
            .mockRejectedValue(new Error("unexpected build"))
          await expect(builder.buildApp()).rejects.toThrow(/serverOutDir/i)
          expect(build).not.toHaveBeenCalled()
        }
      } finally {
        await fs.rm(dir, { recursive: true, force: true })
      }
    }
  )

  it("rejects watch builds before building either environment", async () => {
    const builder = await createBuilder(config({ build: { watch: {} } }))
    const build = vi
      .spyOn(builder, "build")
      .mockRejectedValue(new Error("unexpected build"))
    await expect(builder.buildApp()).rejects.toThrow(
      /HtmlServerVite.*vite build --watch/
    )
    expect(build).not.toHaveBeenCalled()
  })

  it(
    "disposes a server entry once its requests end, on reload and on close",
    async () => {
      const evaluating = deferred()
      const resume = deferred()
      const finalizedV1 = deferred()
      const responding = deferred()
      const release = deferred()
      const events: Array<string> = []
      let evaluations = 0
      const gates: Gates = {
        evaluate: async () => {
          const version = ++evaluations
          if (version === 1) {
            evaluating.resolve()
            await resume.promise
          }
          return version
        },
        respond: async (version) => {
          if (version === 1) return
          responding.resolve()
          await release.promise
          events.push(`handled v${version}`)
        },
        finalize: async (version) => {
          events.push(`finalizing v${version}`)
          await new Promise(setImmediate)
          events.push(`finalized v${version}`)
          if (version === 1) finalizedV1.resolve()
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

      // A v2 request still running when the server closes. Its handler goes
      // on once the HTTP server has closed.
      const held = fetch(origin).catch(() => {})
      await responding.promise
      await finalizedV1.promise
      once(server.httpServer!, "close").then(() => release.resolve())
      await server.close()
      events.push("closed")
      await held
      expect(events).toEqual([
        "finalizing v1",
        "finalized v1",
        "handled v2",
        "finalizing v2",
        "finalized v2",
        "closed"
      ])
    },
    60_000
  )
})
