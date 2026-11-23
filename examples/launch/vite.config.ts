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

const provider = {
  foldkit: [["src/provider/foldkit/editor.ts", ["SaveDraft"]], ["src/provider/foldkit/main.ts", ["app"]]],
  effect: [["src/provider/effect/Editor.ts", ["SaveDraft", "Editor"]], ["src/provider/effect/main.ts", ["root"]]]
} as const

const declared = (block: string): string | undefined => /^(?:export )?(?:const|class) (\w+)/.exec(block)?.[1]

const excerpt = (source: string, names: ReadonlyArray<string>): string =>
  source.split("\n\n").filter((block) => names.includes(declared(block) ?? "")).join("\n\n").trimEnd()

const withoutImports = (source: string): string => source.replace(/^(?:import [^]*?"\n|\n)+/, "").trimEnd()

const tokenize = async (file: string, names?: ReadonlyArray<string>): Promise<Snippet> => {
  const source = await readFile(file, "utf8")
  const result = await codeToTokens(names === undefined ? withoutImports(source) : excerpt(source, names), {
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
      const read = (source: string, names?: ReadonlyArray<string>) => {
        const file = path.join(root, source)
        this.addWatchFile(file)
        return tokenize(file, names)
      }
      const excerpts = (files: ReadonlyArray<readonly [string, ReadonlyArray<string>]>) =>
        Promise.all(files.map(([file, names]) => read(file, names)))
      const [effect, foldkit, providerFoldkit, providerEffect] = await Promise.all([
        read(sources.effect),
        Promise.all(sources.foldkit.map((file) => read(file))),
        excerpts(provider.foldkit),
        excerpts(provider.effect)
      ])
      return [
        `export const effect = ${JSON.stringify(effect)}`,
        `export const foldkit = ${JSON.stringify(foldkit)}`,
        `export const provider = ${JSON.stringify({ foldkit: providerFoldkit, effect: providerEffect })}`,
        ""
      ].join("\n")
    }
  }
}

export default defineConfig({
  plugins: [snippets()]
})
