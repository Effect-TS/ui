// Pre-bundles the @effect/ui app with Rolldown, which tree-shakes, leaving
// react-native to Metro. Measures how much of Metro's bundle is only there
// because Metro does not tree-shake.
import path from "node:path"
import { defineConfig } from "vite"

const root = path.resolve(import.meta.dirname, "..")
const spike = process.env.EXPO_PUBLIC_SPIKE ?? "counter"

export default defineConfig({
  root,
  logLevel: "warn",
  // @effect/ui resolves through the `paths` in tsconfig.json.
  resolve: {
    conditions: ["production", "import", "default"],
    tsconfigPaths: true
  },
  build: {
    outDir: path.join(root, "prebuilt"),
    emptyOutDir: false,
    minify: false,
    target: "es2020",
    lib: {
      entry: path.join(root, `src/main-${spike}.ts`),
      formats: ["cjs"],
      fileName: () => `${spike}.cjs`
    },
    rollupOptions: { external: (id) => id.startsWith("react-native") }
  }
})
