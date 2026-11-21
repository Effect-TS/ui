import { defineConfig } from "vitest/config"

import * as Doctest from "@effect/doctest/Plugin"

export default defineConfig({
  plugins: [Doctest.plugin()],
  resolve: {
    tsconfigPaths: true
  },
  test: {
    passWithNoTests: true,
    testTimeout: 10_000,
    include: [],
    includeSource: [
      "packages/*/src/**/*.ts",
      "packages/*/*/src/**/*.ts"
    ]
  }
})
