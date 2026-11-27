import { DevToolsVite } from "@effect/ui-devtools/node"
import { assert, describe, it } from "@effect/vitest"
import type * as Http from "node:http"
import { parseAst } from "vite"

const source = `
import { Component, Html } from "@effect/ui/html"
export const Model = Schema.Number
export const Load = Command.make("Load", {}, () => Effect.void)
const Def = Html.component({ name: "A" })
export const A = Def.make({})
const Row = Html.component({ name: "Row" }).make({})
const B = Component.define({ name: "B" }).make({})
export { B as Bee }
export const C = B.pipe(Component.provide(layer))
`

describe("DevToolsVite", () => {
  it("accepts updates to a module's exported components", () => {
    const plugin = DevToolsVite.plugin()
    assert.deepStrictEqual(plugin.config({}), {
      experimental: { hmrPartialAccept: true }
    })
    assert.isUndefined(
      plugin.config({ experimental: { hmrPartialAccept: false } })
    )
    plugin.configResolved({ experimental: { hmrPartialAccept: true } })
    const transform = (code: string, id: string) =>
      plugin.transform.call({ parse: parseAst }, code, id)
    const footer = transform(source, "/src/a.ts")!.code.slice(source.length)
    assert.include(footer, "acceptExports([\"A\",\"Bee\",\"C\"]")
    assert.isUndefined(transform(source, "/node_modules/a/a.js"))
    assert.isUndefined(transform("export const Model = 1", "/src/b.ts"))
  })

  it("serves workbench pages under Vite's base when configured", async () => {
    type Middleware = (
      req: Http.IncomingMessage,
      res: Http.ServerResponse,
      next: (error?: unknown) => void
    ) => void
    const serve = (plugin: DevToolsVite.Plugin) => {
      const middlewares: Array<Middleware> = []
      const transformed: Array<string> = []
      let close = () => {}
      plugin.configResolved({ base: "/app/" })
      plugin.configureServer({
        config: { logger: { info: () => {}, warn: () => {} } },
        httpServer: { once: (_, listener) => close = listener },
        middlewares: { use: (handler) => middlewares.push(handler) },
        transformIndexHtml: async (url, html) => {
          transformed.push(url)
          return html
        }
      })
      // The page served, or `undefined` when the request is passed on.
      const get = (url: string) =>
        new Promise<string | undefined>((resolve, reject) =>
          middlewares[0]!(
            { url, method: "GET" } as Http.IncomingMessage,
            { setHeader: () => {}, end: resolve } as never,
            (error) => error === undefined ? resolve(undefined) : reject(error)
          )
        )
      return { middlewares, transformed, get, close: () => close() }
    }

    const plain = serve(DevToolsVite.plugin({ port: 0 }))
    plain.close()
    assert.lengthOf(plain.middlewares, 0)

    const plugin = DevToolsVite.plugin({
      port: 0,
      workbench: { cases: "/src/**/*.cases.ts", setup: "/src/styles.css" }
    })
    const server = serve(plugin)
    try {
      const page = await server.get("/app/__workbench/TodoItem/saved?bare")
      assert.deepStrictEqual(server.transformed, [
        "/__workbench/TodoItem/saved?bare"
      ])
      const src = page?.match(/<script type="module" src="([^"]+)"/)?.[1]
      const entry = plugin.load(plugin.resolveId(src!)!) ?? ""
      assert.include(entry, "/src/styles.css")
      assert.include(entry, "/src/**/*.cases.ts")

      assert.isUndefined(await server.get("/__workbench/TodoItem/saved"))
      assert.isUndefined(await server.get("/app/about"))

      const tags = await plugin.transformIndexHtml()
      assert.deepStrictEqual(
        tags.filter((tag) => tag.tag === "script").map((tag) => tag.attrs.src),
        ["/app/@effect-ui/devtools", "/app/@effect-ui/hot"]
      )
    } finally {
      server.close()
    }
  })
})
