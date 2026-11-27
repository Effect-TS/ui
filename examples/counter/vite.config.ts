import { DevToolsVite } from "@effect/ui-devtools/node"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    tailwindcss(),
    // Open /__workbench/ to see every case in Counter.cases.ts.
    DevToolsVite.plugin({
      workbench: { cases: "/src/**/*.cases.ts", setup: "/src/styles.css" }
    })
  ]
})
