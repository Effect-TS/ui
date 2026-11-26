import { plugin } from "@effect/ui/html/HtmlServerVite"
import { describe, expect, it } from "@effect/vitest"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createBuilder, createServer, type InlineConfig } from "vite"

const config = (overrides: InlineConfig = {}): InlineConfig => ({
  root: path.join(import.meta.dirname, "fixtures", "vite"),
  configFile: false,
  logLevel: "silent",
  resolve: { tsconfigPaths: true },
  plugins: [plugin({ entry: "/src/entry.server.ts" })],
  ...overrides
})

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
})
