import { DevToolsVite } from "@effect/ui-devtools/node"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [tailwindcss(), DevToolsVite.plugin({ dispatch: true })]
})
