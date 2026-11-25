import { DevToolsVite } from "@effect/ui-devtools/node"
import { assert, describe, it } from "@effect/vitest"
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
    assert.include(footer, "[\"A\",\"Bee\",\"C\"], [Row])")
    assert.isUndefined(transform(source, "/node_modules/a/a.js"))
    assert.isUndefined(transform("export const Model = 1", "/src/b.ts"))
  })
})
