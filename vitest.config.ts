import * as path from "node:path"
import type { Plugin } from "vite"
import { defineConfig, mergeConfig, type ViteUserConfig } from "vitest/config"
import { files as kernelFiles } from "./packages/ui/test/kernel/pending.ts"

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

const uiSource = path.join(import.meta.dirname, "packages/ui/src/internal")

/**
 * Resolves today's runtime, `packages/ui/src/internal/runtime.ts`, to the adapter over the new kernel.
 * Goes away once the kernel replaces the runtime.
 */
const kernelRuntime = (): Plugin => {
  const runtime = path.join(uiSource, "runtime.ts")
  const adapter = path.join(uiSource, "next", "runtime.ts")
  return {
    name: "effect-ui-kernel-runtime",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === "@effect/ui/internal/runtime") return adapter
      if (
        importer === undefined || !source.endsWith("/runtime.ts") ||
        !source.startsWith(".")
      ) return null
      return path.resolve(path.dirname(importer), source) === runtime
        ? adapter
        : null
    }
  }
}

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      ...project("scripts", "scripts", true, {
        test: { include: ["codemods/jsdoc.test.ts"] }
      }),
      // Node reuses workers across test files, which skips re-importing the effect module graph for every file.
      ...project("@effect/ui", "packages/ui", true, {
        test: { isolate: !isNode, exclude: ["test/kernel/**"] }
      }),
      // The same tests against the new runtime, as far as it is ported. Goes away once it replaces today's.
      ...project("@effect/ui (kernel)", "packages/ui", true, {
        plugins: [kernelRuntime()],
        test: { isolate: !isNode, setupFiles: ["test/kernel/setup.ts"] }
      }).map((config) => ({
        ...config,
        test: {
          ...config.test,
          include: [
            "test/kernel/*.test.ts",
            ...kernelFiles.map((file) => `test/${file}`)
          ]
        }
      })),
      ...project("@effect/ui-kit", "packages/ui-kit"),
      ...project("@effect/ui-devtools", "packages/ui-devtools"),
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
