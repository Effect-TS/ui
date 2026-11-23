---
"@effect/ui": minor
---

Add Markdown content to `@effect/ui/html`. `MarkdownParser.parseMarkdown` parses CommonMark plus GFM tables and strikethrough, frontmatter and directive islands (`::Name{key="value"}` and `:::Name` ... `:::`) into a Schema-typed `Markdown.Document`, and fails with a `ParseError` on the first line outside that vocabulary, such as raw HTML, a reference-style link or a `javascript:` URL. `Markdown.view` and `Markdown.viewBlocks` render a document with unstyled semantic elements, with `views` to override any node and `islands` to render components in the prose. `Markdown.islandsFor` decodes each island's attributes through its schema, and the services the island views need surface on the component that renders them.

`@effect/ui/html/MarkdownVite` is a Vite plugin that compiles imported `.md` files at build time, so no parser ships to the browser, and `@effect/ui/html/MarkdownContent` types those imports. The parser has no dependencies.
