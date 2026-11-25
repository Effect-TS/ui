// Builds the DevTools server's page into dist/viewer.html: one HTML file with its script inlined, so the
// server needs no bundler at runtime.
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { build } from "vite"

const viewer = fileURLToPath(
  new URL("../src/internal/viewer.ts", import.meta.url)
)
const out = new URL("../dist/viewer.html", import.meta.url)
const entry = "\0effect-ui-devtools-viewer"

const { output } = await build({
  configFile: false,
  logLevel: "warn",
  root: fileURLToPath(new URL("..", import.meta.url)),
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [{
    name: "viewer-entry",
    resolveId: (id) => id === entry ? id : undefined,
    load: (id) =>
      id === entry
        ? "import { main } from " + JSON.stringify(viewer) + "\nmain()\n"
        : undefined
  }],
  build: {
    write: false,
    minify: true,
    rolldownOptions: {
      input: entry,
      output: { format: "es", codeSplitting: false }
    }
  }
})
const chunk = output.find((file) => file.type === "chunk")
const script = chunk.code.replaceAll("</script", "<\\/script")

await mkdir(new URL(".", out), { recursive: true })
await writeFile(
  out,
  "<!doctype html><html><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width\">" +
    "<title>Effect UI DevTools</title></head>" +
    "<body><div id=\"root\"></div><script type=\"module\">" + script +
    "</script></body></html>\n"
)
console.log("Built " + fileURLToPath(out))
