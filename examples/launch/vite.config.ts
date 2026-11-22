import { readFile } from "node:fs/promises"
import * as path from "node:path"
import { codeToTokens } from "shiki"
import { defineConfig, type Plugin } from "vite"
import type { Snippet } from "./src/domain/Snippet.ts"

const id = "virtual:snippets"
const resolved = `\0${id}`

const sources = {
  effect: "src/demo/DialogPage.ts",
  foldkit: [
    "src/foldkit/model.ts",
    "src/foldkit/message.ts",
    "src/foldkit/init.ts",
    "src/foldkit/update.ts",
    "src/foldkit/view.ts"
  ]
}

const withoutImports = (source: string): string => source.replace(/^(?:import [^]*?"\n|\n)+/, "").trimEnd()

const tokenize = async (file: string): Promise<Snippet> => {
  const result = await codeToTokens(withoutImports(await readFile(file, "utf8")), {
    lang: "ts",
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: "light-dark()"
  })
  return {
    name: path.basename(file),
    lines: result.tokens.map((line) =>
      line.map((token) => ({ text: token.content, color: token.htmlStyle?.color ?? "" }))
    )
  }
}

const snippets = (): Plugin => {
  let root = ""
  return {
    name: "launch:snippets",
    configResolved(config) {
      root = config.root
    },
    resolveId(source) {
      return source === id ? resolved : undefined
    },
    async load(module) {
      if (module !== resolved) return
      const read = (source: string) => {
        const file = path.join(root, source)
        this.addWatchFile(file)
        return tokenize(file)
      }
      const [effect, foldkit] = await Promise.all([read(sources.effect), Promise.all(sources.foldkit.map(read))])
      return `export const effect = ${JSON.stringify(effect)}\nexport const foldkit = ${JSON.stringify(foldkit)}\n`
    }
  }
}

export default defineConfig({
  plugins: [snippets()]
})
