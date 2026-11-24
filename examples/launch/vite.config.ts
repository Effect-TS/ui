import { markdown } from "@effect/ui/html/MarkdownVite"
import tailwindcss from "@tailwindcss/vite"
import { Schema } from "effect"
import { readFile } from "node:fs/promises"
import * as path from "node:path"
import { codeToTokens } from "shiki"
import { defineConfig, type Plugin } from "vite"
import { toMarkdown } from "./src/domain/ArticleText.ts"
import { type Excerpt, test, whole } from "./src/domain/Excerpt.ts"
import { Frontmatter, Islands } from "./src/domain/Island.ts"
import { type Snippet, Snippets } from "./src/domain/Snippet.ts"

const id = "virtual:snippets"
const resolved = `\0${id}`

const sources: {
  readonly [K in keyof Snippets]: ReadonlyArray<
    readonly [string, Excerpt]
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
  ]],
  partsFoldkit: [["src/parts/foldkit/Faq.ts", whole]],
  partsEffect: [["src/parts/effect/Faq.ts", whole]],
  partsOwn: [["src/parts/Disclosure.ts", whole], [
    "src/parts/Details.ts",
    whole
  ]],
  mount: [["src/main.ts", whole]],
  provider: [["src/provider/CartProvider.ts", whole], [
    "src/provider/Shop.ts",
    whole
  ]]
}

const tokenize = async (
  file: string,
  select: Excerpt
): Promise<Snippet> => {
  const code = select(await readFile(file, "utf8"))
  if (code === "") throw new Error(`Nothing to show from ${file}`)
  const result = await codeToTokens(code, {
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

const files = (root: string) =>
  Object.values(sources).flatMap((list) =>
    list.map(([source]) => path.join(root, source))
  )

const tokenizeAll = async (root: string): Promise<Snippets> => {
  const entries = await Promise.all(
    Object.entries(sources).map(async ([key, list]) =>
      [
        key,
        await Promise.all(
          list.map(([source, select]) =>
            tokenize(path.join(root, source), select)
          )
        )
      ] as const
    )
  )
  return Schema.decodeUnknownSync(Snippets)(
    Object.fromEntries(entries)
  )
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
      files(root).forEach((file) => this.addWatchFile(file))
      return `export const snippets = ${
        JSON.stringify(await tokenizeAll(root))
      }\n`
    }
  }
}

const articleText = (): Plugin => {
  let root = ""
  const render = async () =>
    toMarkdown(
      await readFile(path.join(root, "src/article.md"), "utf8"),
      await tokenizeAll(root)
    )
  return {
    name: "launch:article-text",
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      server.middlewares.use("/article.md", (_request, response) => {
        render().then((text) => {
          response.setHeader(
            "Content-Type",
            "text/markdown; charset=utf-8"
          )
          response.end(text)
        })
      })
    },
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "article.md",
        source: await render()
      })
    }
  }
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    snippets(),
    articleText(),
    markdown({ islands: Islands, frontmatter: Frontmatter })
  ]
})
