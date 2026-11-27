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

  it("serves workbench pages through transformIndexHtml and generates the entry module when configured", async () => {
    type Middleware = (
      req: Http.IncomingMessage,
      res: Http.ServerResponse,
      next: (error?: unknown) => void
    ) => void

    const setupServer = (plugin: DevToolsVite.Plugin) => {
      const middlewares: Array<Middleware> = []
      const transformed: Array<string> = []
      let close = () => {}
      const returned = plugin.configureServer({
        config: { logger: { info: () => {}, warn: () => {} } },
        httpServer: {
          once: (_event: string, listener: () => void) => close = listener
        },
        middlewares: {
          use: (handler: Middleware) => {
            middlewares.push(handler)
          }
        },
        transformIndexHtml: async (url: string, html: string) => {
          transformed.push(url)
          return html
        }
      } as never)
      return { middlewares, transformed, returned, close }
    }

    const request = async (
      middlewares: ReadonlyArray<Middleware>,
      url: string
    ) => {
      let status = 200
      const headers: Record<string, string> = {}
      let body = ""
      let passed = false
      let ended = false
      const res = {
        get statusCode() {
          return status
        },
        set statusCode(code: number) {
          status = code
        },
        setHeader(name: string, value: string) {
          headers[name.toLowerCase()] = value
        },
        end(chunk?: string) {
          if (chunk !== undefined) body += chunk
          ended = true
        }
      }
      for (const middleware of middlewares) {
        passed = false
        await new Promise<void>((resolve, reject) => {
          const done = () => resolve()
          const wrappedRes = {
            ...res,
            get statusCode() {
              return status
            },
            set statusCode(code: number) {
              status = code
            },
            setHeader: res.setHeader,
            end(chunk?: string) {
              res.end(chunk)
              done()
            }
          }
          try {
            const result = middleware(
              { url, method: "GET" } as Http.IncomingMessage,
              wrappedRes as unknown as Http.ServerResponse,
              (error?: unknown) => {
                if (error !== undefined) reject(error)
                else {
                  passed = true
                  done()
                }
              }
            ) as unknown
            if (
              result !== null && typeof result === "object" &&
              "catch" in result && typeof result.catch === "function"
            ) {
              ;(result as Promise<unknown>).catch(reject)
            }
          } catch (error) {
            reject(error)
          }
        })
        if (ended) break
      }
      return { status, headers, body, passed, ended }
    }

    const plain = DevToolsVite.plugin({ port: 0 })
    const plainServer = setupServer(plain)
    try {
      const skipped = await request(
        plainServer.middlewares,
        "/__workbench/TodoItem/saved"
      )
      assert.isFalse(skipped.ended)
    } finally {
      plainServer.close()
    }

    const plugin = DevToolsVite.plugin({
      port: 0,
      workbench: {
        cases: "/src/**/*.cases.ts",
        setup: "/src/styles.css"
      }
    })
    const server = setupServer(plugin)
    try {
      assert.isUndefined(server.returned)
      assert.isAbove(server.middlewares.length, 0)

      const page = await request(
        server.middlewares,
        "/__workbench/TodoItem/saved"
      )
      assert.isTrue(page.ended)
      assert.strictEqual(page.status, 200)
      assert.include(page.headers["content-type"] ?? "", "text/html")
      assert.deepStrictEqual(server.transformed, [
        "/__workbench/TodoItem/saved"
      ])
      assert.include(page.body, "id=\"root\"")

      const match = page.body.match(
        /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/
      )
      assert.isNotNull(match)
      const resolved = plugin.resolveId(match![1]!)
      assert.isDefined(resolved)
      const entry = plugin.load(resolved!)
      assert.isDefined(entry)
      assert.include(entry!, "/src/styles.css")
      assert.include(entry!, "/src/**/*.cases.ts")

      const appRoute = await request(server.middlewares, "/about")
      assert.isTrue(appRoute.passed)
      assert.isFalse(appRoute.ended)
    } finally {
      server.close()
    }
  })
})
