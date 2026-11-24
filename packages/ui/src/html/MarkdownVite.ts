/**
 * A Vite plugin that compiles imported `.md` files at build time into
 * document modules, so no parser ships to the browser.
 *
 * Each module's default export is the encoded document; decode it with
 * `Markdown.decodeDocument` and render it with `Markdown.view`. Each module
 * also exports `frontmatter`: the checked fields when the plugin has a
 * `frontmatter` schema and the file has a frontmatter block, and
 * `undefined` otherwise. Source outside the vocabulary fails the build with
 * the construct and its line.
 *
 * Add `@effect/ui/html/MarkdownContent` to `compilerOptions.types` for the
 * `*.md` module types.
 *
 * **Example** (Configuring the plugin)
 *
 * ```ts import.meta.vitest
 * import { markdown } from "@effect/ui/html/MarkdownVite"
 * import { Schema } from "effect"
 *
 * // vite.config.ts: export default { plugins: [plugin] }
 * const plugin = markdown({
 *   frontmatter: Schema.Struct({ title: Schema.String }),
 *   islands: { Counter: Schema.Struct({ label: Schema.optionalKey(Schema.String) }) }
 * })
 *
 * const compiled = plugin.transform("---\ntitle: Hello\n---\n\n::Counter", "/posts/hello.md")
 * compiled?.code.split("\n")[1] // => 'export const frontmatter = {"title":"Hello"}'
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Option from "effect/Option"
import * as Markdown from "./Markdown.ts"
import * as MarkdownParser from "./MarkdownParser.ts"

/**
 * The subset of a Vite plugin that `markdown` returns. It is assignable to
 * Vite's `Plugin` without importing `vite`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Plugin {
  readonly name: string
  readonly transform: (
    source: string,
    id: string
  ) => TransformResult | undefined
}

/**
 * The module code a `.md` file compiles to.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TransformResult {
  readonly code: string
  readonly map: null
}

/**
 * Creates the Vite plugin. It transforms module ids ending in `.md` and
 * leaves every other module untouched. Options are checked once, here.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const markdown = (options: MarkdownParser.Options = {}): Plugin => {
  MarkdownParser.parseMarkdown("", options)
  return {
    name: "effect-ui-markdown",
    transform(source, id) {
      if (!id.endsWith(".md")) {
        return undefined
      }
      const { document, frontmatter } = MarkdownParser
        .parseMarkdownWithFrontmatter(source, options)
      const fields = Option.match(frontmatter, {
        onNone: () => "undefined",
        onSome: (fields) => JSON.stringify(fields)
      })
      return {
        code: `export default ${
          JSON.stringify(Markdown.encodeDocument(document))
        }\nexport const frontmatter = ${fields}\n`,
        map: null
      }
    }
  }
}
