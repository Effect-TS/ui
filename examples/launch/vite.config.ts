import { readFile } from "node:fs/promises"
import * as path from "node:path"
import { codeToTokens } from "shiki"
import { defineConfig, type Plugin } from "vite"
import type { Snippet } from "./src/domain/Snippet.ts"

const id = "virtual:snippets"
const resolved = `\0${id}`

const counter = {
  foldkit: ["src/counter/foldkit/Counter.ts", "src/counter/foldkit/Page.ts"],
  effect: ["src/counter/effect/Counter.ts", "src/counter/effect/Page.ts"]
}

const provider = {
  foldkit: [["src/provider/foldkit/editor.ts", ["SaveDraft"]], ["src/provider/foldkit/main.ts", ["app"]]],
  effect: [["src/provider/effect/Editor.ts", ["SaveDraft", "Editor"]], ["src/provider/effect/main.ts", ["root"]]]
} as const

const kept = [["src/counter/kept/Counter.ts", "scoped: true"], ["src/counter/kept/Page.ts", "h.scoped("]] as const

const declared = (block: string): string | undefined => /^(?:export )?(?:const|class) (\w+)/.exec(block)?.[1]

const excerpt = (source: string, names: ReadonlyArray<string>): string =>
  source.split("\n\n").filter((block) => names.includes(declared(block) ?? "")).join("\n\n").trimEnd()

const withoutImports = (source: string): string => source.replace(/^(?:import [^]*?"\n|\n)+/, "").trimEnd()

const lineWith = (source: string, text: string): string =>
  source.split("\n").find((line) => line.includes(text))?.trim() ?? ""

const tokenize = async (file: string, select: (source: string) => string): Promise<Snippet> => {
  const source = await readFile(file, "utf8")
  const result = await codeToTokens(select(source), {
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
      const read = (source: string, select: (source: string) => string) => {
        const file = path.join(root, source)
        this.addWatchFile(file)
        return tokenize(file, select)
      }
      const whole = (files: ReadonlyArray<string>) => Promise.all(files.map((file) => read(file, withoutImports)))
      const excerpts = (files: ReadonlyArray<readonly [string, ReadonlyArray<string>]>) =>
        Promise.all(files.map(([file, names]) => read(file, (source) => excerpt(source, names))))
      const [counterFoldkit, counterEffect, providerFoldkit, providerEffect, keptLines] = await Promise.all([
        whole(counter.foldkit),
        whole(counter.effect),
        excerpts(provider.foldkit),
        excerpts(provider.effect),
        Promise.all(kept.map(([file, text]) => read(file, (source) => lineWith(source, text))))
      ])
      return [
        `export const counter = ${JSON.stringify({ foldkit: counterFoldkit, effect: counterEffect })}`,
        `export const provider = ${JSON.stringify({ foldkit: providerFoldkit, effect: providerEffect })}`,
        `export const kept = ${JSON.stringify(keptLines)}`,
        ""
      ].join("\n")
    }
  }
}

export default defineConfig({
  plugins: [snippets()]
})
