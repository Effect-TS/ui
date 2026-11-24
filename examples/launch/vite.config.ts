import { markdown } from "@effect/ui/html/MarkdownVite"
import { readFile } from "node:fs/promises"
import * as path from "node:path"
import { codeToTokens } from "shiki"
import { defineConfig, type Plugin } from "vite"
import { Frontmatter, Islands } from "./src/domain/Island.ts"
import type { Snippet, Snippets } from "./src/domain/Snippet.ts"

const id = "virtual:snippets"
const resolved = `\0${id}`

type Select = (source: string) => string

const whole: Select = (source) =>
  source.replace(/^(?:\/\/ @vitest[^\n]*\n|import [^]*?"\n|\n)+/, "")
    .trimEnd()

const test = (title: string): Select => (source) => {
  const lines = source.split("\n")
  const start = lines.findIndex((line) =>
    /^\s*it(\.effect)?\(/.test(line) && line.includes(`"${title}"`)
  )
  if (start < 0) throw new Error(`No test named "${title}"`)
  const indent = lines[start].search(/\S/)
  const end = lines.findIndex((line, index) =>
    index > start && line.search(/\S/) === indent
  )
  return lines.slice(start, end + 1).map((line) => line.slice(indent))
    .join("\n")
}

const sources: {
  readonly [K in keyof Snippets]: ReadonlyArray<
    readonly [string, Select]
  >
} = {
  intro: [["src/autocounter/Counter.ts", whole]],
  split: [["src/autocounter/split/Counter.ts", whole]],
  counterFoldkit: [["src/counter/foldkit/Counter.ts", whole], [
    "src/counter/foldkit/Page.ts",
    whole
  ]],
  counterEffect: [["src/counter/effect/Counter.ts", whole], [
    "src/counter/effect/Page.ts",
    whole
  ]],
  queryFoldkit: [["src/queries/foldkit/posts.ts", whole]],
  queryEffect: [["src/queries/effect/Posts.ts", whole]],
  storyFoldkit: [[
    "src/autocounter/foldkit/counter.story.test.ts",
    test("resets after the delay")
  ]],
  storyEffect: [[
    "src/autocounter/Counter.story.test.ts",
    test("resets after the delay")
  ]],
  sceneFoldkit: [[
    "src/autocounter/foldkit/counter.scene.test.ts",
    test("resets after the delay")
  ]],
  sceneEffect: [[
    "src/autocounter/Counter.scene.test.ts",
    test("resets after the delay")
  ]],
  play: [[
    "src/autocounter/Counter.play.test.ts",
    test("resets one second after the click")
  ]]
}

const tokenize = async (
  file: string,
  select: Select
): Promise<Snippet> => {
  const source = await readFile(file, "utf8")
  const result = await codeToTokens(select(source), {
    lang: "ts",
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: "light-dark()"
  })
  return {
    name: path.basename(file),
    lines: result.tokens.map((line) =>
      line.map((token) => ({
        text: token.content,
        color: token.htmlStyle?.color ?? ""
      }))
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
      const entries = await Promise.all(
        Object.entries(sources).map(async ([key, files]) => {
          const snippets = await Promise.all(
            files.map(([source, select]) => {
              const file = path.join(root, source)
              this.addWatchFile(file)
              return tokenize(file, select)
            })
          )
          return [key, snippets] as const
        })
      )
      return `export const snippets = ${
        JSON.stringify(Object.fromEntries(entries))
      }\n`
    }
  }
}

export default defineConfig({
  plugins: [
    snippets(),
    markdown({ islands: Islands, frontmatter: Frontmatter })
  ]
})
