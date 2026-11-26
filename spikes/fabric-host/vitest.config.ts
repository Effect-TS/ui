import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    conditions: ["production"],
    alias: [{
      find: /^@effect\/ui\/(.*)$/,
      replacement: path.resolve(
        import.meta.dirname,
        "../../packages/ui/src/$1.ts"
      )
    }]
  },
  test: { include: ["test/**/*.test.ts"] }
})
