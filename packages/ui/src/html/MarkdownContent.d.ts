/**
 * Module types for `.md` imports compiled by `@effect/ui/html/MarkdownVite`.
 * Add `"@effect/ui/html/MarkdownContent"` to `compilerOptions.types`, or
 * reference it with `/// <reference types="@effect/ui/html/MarkdownContent" />`.
 *
 * @stability experimental
 * @since 0.1.0
 */
declare module "*.md" {
  import type { DocumentEncoded } from "@effect/ui/html/Markdown"
  /**
   * The encoded document. Decode it with `Markdown.decodeDocument`.
   */
  const document: DocumentEncoded
  export default document
  /**
   * The frontmatter fields, already checked against the plugin's
   * `frontmatter` schema, or `undefined` when the file has no
   * frontmatter block.
   */
  export const frontmatter: Readonly<Record<string, string>> | undefined
}
