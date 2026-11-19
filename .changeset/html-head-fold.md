---
"@effect/ui": minor
---

Split `Head` into a host-neutral `Head` and an HTML-only `HtmlHead`. This is a breaking rename with no aliases. `Head` from `@effect/ui` keeps `title`, `titleTemplate`, the fold `Tree` and `Head.Head` (`{ title }`). Everything else moves to `HtmlHead`, imported from `@effect/ui/html` or `@effect/ui/html/HtmlHead`: `meta`, `link`, `jsonLd`, `lang`, `dir`, `htmlClass`, `bodyClass`, `htmlData`, `bodyData`, `marker`, `canonicalJson`, `identity`, `attributes`, `empty`, `merge` and the `HtmlHead.HtmlHead` type. Replace `Head.meta(...)` with `HtmlHead.meta(...)` and so on. A component's `head` entries are typed by its vocabulary: a component with no `elements` may return only `Head.title` and `Head.titleTemplate`, and one on `Html` may return both kinds.

The mount now folds the head once per flush, over the placed view tree. A component placed in a child's `fallback` contributes its head. Two siblings that set the same single slot (the title, `lang`, `dir`, the canonical link or the same meta tag) are reported to `Query.Problems` as a `HeadConflict` with both paths, and the later sibling still wins. A descendant overriding its ancestor isn't a conflict.

New `reduceHead: (model, below) => head` component option. `below` is the folded head of the instance and everything its view placed, and the root's result is final. A layout can use it to derive `og:title` from the title that won, for example.

New `head: false` mount option for `BrowserHost.mount`, `BrowserHost.mountEffect` and `Renderer.mount`. An embedded mount still computes its head, but never writes `document.title`, a head tag or a document attribute. Hosts on one document now share one baseline of the shell's values.

Other changes:

- `Router.Settled.head` is now `Settled.title: string | undefined`.
- `Renderer.Prerendered` takes the head type as a second parameter.
- `Renderer.Hydration.adopted` is removed. `ssr` compares the server's head with the client's first fold of the server's state.
- `TestRoot.head` returns the root vocabulary's head. Write `root.head<HtmlHead.HtmlHead>()` to read an `Html` root's.
