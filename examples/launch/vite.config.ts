import { readFile } from "node:fs/promises"
import * as path from "node:path"
import { codeToTokens } from "shiki"
import { defineConfig, type Plugin } from "vite"

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

const withoutImports = (source: string): string => {
  const lines = source.split("\n")
  let start = 0
  let inImport = false
  while (start < lines.length) {
    const line = lines[start]!
    if (inImport) {
      inImport = !/ from "[^"]+"$/.test(line)
    } else if (line.startsWith("import ")) {
      inImport = !/ from "[^"]+"$|^import "[^"]+"$/.test(line)
    } else if (line.trim() !== "" && !line.startsWith("//")) {
      break
    }
    start++
  }
  return lines.slice(start).join("\n").trimEnd()
}

const tokenize = async (file: string) => {
  const source = withoutImports(await readFile(file, "utf8"))
  const result = await codeToTokens(source, { lang: "ts", themes: { light: "github-light", dark: "github-dark" } })
  const lines = result.tokens.map((line) =>
    line.map((token) => ({
      text: token.content,
      light: token.htmlStyle?.color ?? "",
      dark: token.htmlStyle?.["--shiki-dark"] ?? ""
    }))
  )
  return { name: path.basename(file), lines }
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
      const files = [sources.effect, ...sources.foldkit].map((file) => path.join(root, file))
      for (const file of files) this.addWatchFile(file)
      const [effect, ...foldkit] = await Promise.all(files.map(tokenize))
      return `export const effect = ${JSON.stringify(effect)}\nexport const foldkit = ${JSON.stringify(foldkit)}\n`
    }
  }
}

export default defineConfig({
  plugins: [snippets()]
})
