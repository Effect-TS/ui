import { DevToolsVite } from "@effect/ui-devtools/node"
import { plugin as htmlServer } from "@effect/ui/html/HtmlServerVite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    tailwindcss(),
    htmlServer({ entry: "/src/entry.server.ts" }),
    DevToolsVite.plugin()
  ]
})
