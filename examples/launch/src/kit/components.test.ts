import { assert, describe, it } from "@effect/vitest"
import { readdirSync, readFileSync } from "node:fs"
import { modules } from "./components.ts"

const kit = new URL(
  "../../../../packages/ui-kit/src/",
  import.meta.url
)

const app = new URL("../", import.meta.url)

const article = readFileSync(new URL("article.md", app), "utf8")

describe("kit components", () => {
  it("lists every module of the kit", () => {
    const modules = readdirSync(kit)
      .filter((file) => file.endsWith(".ts") && file !== "index.ts")
      .map((file) => file.slice(0, -".ts".length))
    assert.deepStrictEqual(
      [...modules].sort(),
      modules.sort()
    )
  })

  it("is counted correctly in the article", () => {
    assert.include(article, `${modules.length} components`)
  })
})
