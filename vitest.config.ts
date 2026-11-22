import * as path from "node:path"
import { defineConfig, mergeConfig, type ViteUserConfig } from "vitest/config"

const isDeno = process.versions.deno !== undefined
const isBun = process.versions.bun !== undefined
const isNode = typeof process !== "undefined" &&
  process.release.name === "node" &&
  !isDeno &&
  !isBun

const project = (
  name: string,
  directory: string,
  include: boolean = true,
  config: ViteUserConfig = {}
) => {
  if (!include) {
    return []
  }

  const cfg = mergeConfig({
    root: directory,
    test: { name }
  }, config)

  return [mergeConfig(shared, cfg)]
}

const example = (name: string) =>
  project(name, path.join("examples", name), true, {
    test: {
      include: ["src/**/*.test.ts"],
      setupFiles: ["@effect/ui/html/register"]
    }
  })

export const exclude = [
  "**/.*/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/benchmark/**",
  "**/typetest/**",
  "**/coverage/**",
  "**/test/utils/**",
  "**/*.d.ts",
  "**/*.config.*",
  "**/vitest.*"
]

const shared: ViteUserConfig = {
  server: {
    watch: {
      ignored: exclude
    }
  },
  resolve: {
    tsconfigPaths: true
  },
  test: {
    exclude,
    passWithNoTests: true,
    setupFiles: [path.join(import.meta.dirname, "vitest.setup.ts")],
    sequence: {
      concurrent: true
    },
    include: ["test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["html"],
      reportsDirectory: "coverage",
      exclude
    }
  }
}

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      ...project("scripts", "scripts", true, { test: { include: ["codemods/jsdoc.test.ts"] } }),
      // Node reuses workers across test files, which skips re-importing the effect module graph for every file.
      ...project("@effect/ui", "packages/ui", true, { test: { isolate: !isNode } }),
      ...project("@effect/ui-kit", "packages/ui-kit"),
      ...example("auth"),
      ...example("canvas-art"),
      ...example("counter"),
      ...example("counters"),
      ...example("file-preview"),
      ...example("interrupting-commands"),
      ...example("routing"),
      ...example("snake")
    ]
  }
})
