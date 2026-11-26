// Pre-bundles the @effect/ui app with Rolldown, which tree-shakes, leaving
// react-native to Metro. Measures how much of Metro's bundle is only there
// because Metro does not tree-shake.
import path from "node:path"
import { defineConfig } from "vite"

const root = path.resolve(import.meta.dirname, "..")

export default defineConfig({
  root,
  logLevel: "warn",
  resolve: {
    conditions: ["production", "import", "default"],
    alias: [{
      find: /^@effect\/ui\/(.*)$/,
      replacement: path.resolve(root, "../../packages/ui/src/$1.ts")
    }]
  },
  define: {
    "process.env.EXPO_PUBLIC_SPIKE": JSON.stringify(
      process.env.EXPO_PUBLIC_SPIKE ?? "counter"
    )
  },
  build: {
    outDir: path.join(root, "prebuilt"),
    emptyOutDir: false,
    minify: false,
    target: "es2020",
    lib: {
      entry: path.join(root, "src/main.ts"),
      formats: ["cjs"],
      fileName: () => `${process.env.EXPO_PUBLIC_SPIKE ?? "counter"}.cjs`
    },
    rollupOptions: { external: (id) => id.startsWith("react-native") }
  }
})
