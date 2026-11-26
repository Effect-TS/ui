import { defineConfig } from "vitest/config"

export default defineConfig({
  // @effect/ui resolves through the `paths` in tsconfig.json.
  resolve: { conditions: ["production"], tsconfigPaths: true },
  test: { include: ["test/**/*.test.ts"] }
})
