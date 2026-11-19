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

// Resolves every import of the runtime to the kernel beside it, so the suite runs against both until
// the kernel replaces the runtime.
const kernelRuntime = path.join(import.meta.dirname, "packages/ui/src/internal/kernel/runtime.ts")
const runtimeFile = path.join(import.meta.dirname, "packages/ui/src/internal/runtime.ts")
const onKernel: ViteUserConfig = {
  plugins: [{
    name: "kernel-runtime",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!/internal\/runtime(\.ts)?$/.test(source)) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      return resolved !== null && resolved.id === runtimeFile ? kernelRuntime : resolved
    }
  }]
}

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      ...project("scripts", "scripts", true, { test: { include: ["codemods/jsdoc.test.ts"] } }),
      // Node reuses workers across test files, which skips re-importing the effect module graph for every file.
      ...project("@effect/ui", "packages/ui", true, { test: { isolate: !isNode } }),
      ...project("@effect/ui-kit", "packages/ui-kit"),
      ...project("@effect/ui (kernel)", "packages/ui", true, mergeConfig({ test: { isolate: !isNode } }, onKernel)),
      ...project("@effect/ui-kit (kernel)", "packages/ui-kit", true, onKernel),
      ...example("interrupting-commands")
    ]
  }
})
