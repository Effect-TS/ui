import { plugin } from "@effect/ui/html/HtmlServerVite"
import { describe, expect, it } from "tstyche"
import type { Plugin } from "vite"

describe("HtmlServerVite.plugin", () => {
  it("is assignable to Vite's Plugin", () => {
    expect(plugin({ entry: "/src/entry.server.ts" })).type.toBeAssignableTo<
      Plugin
    >()
  })
})
