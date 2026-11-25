import { markdown } from "@effect/ui/html/MarkdownVite"
import tailwindcss from "@tailwindcss/vite"
import { Schema } from "effect"
import { readFile } from "node:fs/promises"
import * as path from "node:path"
import { codeToTokens } from "shiki"
import { defineConfig, type Plugin } from "vite"
import { toMarkdown } from "./src/domain/ArticleText.ts"
import {
  all,
  declaration,
  type Excerpt,
  test,
  whole
} from "./src/domain/Excerpt.ts"
import { bodies, type Folds, none } from "./src/domain/Fold.ts"
import { Frontmatter, Islands } from "./src/domain/Island.ts"
import { type Snippet, Snippets } from "./src/domain/Snippet.ts"

const id = "virtual:snippets"
const resolved = `\0${id}`

const sources: {
  readonly [K in keyof Snippets]: ReadonlyArray<
    readonly [string, Excerpt, Folds?]
  >
} = {
  intro: [["src/autocounter/Counter.ts", whole]],
  split: [[
    "src/autocounter/split/Counter.ts",
    whole,
    bodies("init", "update", "subscriptions", "view")
  ]],
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
  tests: [
    [
      "src/autocounter/Counter.story.test.ts",
      test("resets after the delay")
    ],
    [
      "src/autocounter/Counter.scene.test.ts",
      test("resets after the delay")
    ]
  ],
  play: [[
    "src/autocounter/Counter.play.test.ts",
    test("resets one second after the click")
  ]],
  playSignIn: [[
    "../auth/src/App.play.test.ts",
    all(
      declaration("AppTest"),
      test(
        "a successful login saves the session and lands on the dashboard"
      )
    )
  ]],
  playSnake: [[
    "../snake/src/SnakeGame.play.test.ts",
    test("steers to the apple, eats it and pauses")
  ]],
  partsUse: [["src/parts/Details.ts", whole]],
  partsDefine: [["src/parts/Disclosure.ts", whole]],
  mount: [["src/main.ts", whole]],
  provider: [["src/provider/CartProvider.ts", whole], [
    "src/provider/Shop.ts",
    whole
  ]]
}

// The themes' colours that fall short of 4.5:1 against a code
// window's background, each swapped for a darker or lighter colour
// from the same GitHub palette.
const colorReplacements = {
  "github-light": { "#d73a49": "#b31d28", "#e36209": "#953800" },
  "github-dark": { "#6a737d": "#8b949e" }
}

const tokenize = async (
  key: string,
  file: string,
  select: Excerpt,
  fold: Folds = none
): Promise<Snippet> => {
  const code = select(await readFile(file, "utf8"))
  if (code === "") throw new Error(`Nothing to show from ${file}`)
  const result = await codeToTokens(code, {
    lang: "ts",
    themes: { light: "github-light", dark: "github-dark" },
    colorReplacements,
    defaultColor: "light-dark()"
  })
  const name = path.basename(file)
  return {
    id: `${key}/${name}`,
    name,
    lines: result.tokens.map((line) =>
      line.map((token) => ({
        text: token.content,
        color: token.htmlStyle?.color ?? ""
      }))
    ),
    folds: fold(code)
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
          list.map(([source, select, fold]) =>
            tokenize(key, path.join(root, source), select, fold)
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
