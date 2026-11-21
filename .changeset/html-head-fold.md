---
"@effect/ui": minor
---

Split `Head` into a host-neutral `Head` and an HTML-only `HtmlHead`. This is a breaking rename with no aliases. `Head` from `@effect/ui` keeps `title`, `titleTemplate`, the fold `Tree` and `Head.Head` (`{ title }`). Everything else moves to `HtmlHead`, imported from `@effect/ui/html` or `@effect/ui/html/HtmlHead`: `meta`, `link`, `jsonLd`, `lang`, `dir`, `htmlClass`, `bodyClass`, `htmlData`, `bodyData`, `marker`, `canonicalJson`, `identity`, `attributes`, `empty`, `merge` and the `HtmlHead.HtmlHead` type. Replace `Head.meta(...)` with `HtmlHead.meta(...)` and so on. A component's `head` entries are typed by its vocabulary: a component with no `elements` may return only `Head.title` and `Head.titleTemplate`, and one on `Html` may return both kinds.

The mount now folds the head once per flush, over the placed view tree. A component placed in a child's `fallback` contributes its head. The folded head doesn't depend on where siblings sit in a view: moving a component in its parent's view never changes it. Siblings that set the same single slot (the title, `lang`, `dir`, a `data-*` attribute, or a meta, link or JSON-LD entry of one identity) to the same value pass it up once. When they set different values, neither wins: the slot is left unset, and unless a `reduceHead` above them sets it, it's reported to `Query.Problems` as a `HeadConflict` naming every path that set it, sorted. A descendant overriding its ancestor isn't a conflict. Meta, link and JSON-LD entries and `class` tokens are printed as each node wrote its own, then its children's, ordered by path.

New `reduceHead: (model, below) => head` component option. `below` is the folded head of the instance and everything its view placed, and the root's result is final. A layout can use it to derive `og:title` from the title that won, for example. Siblings of a `Head.Tree` that contribute to the head need distinct paths, and `merge` throws when two have none or share one.

New `head: false` mount option for `BrowserHost.mount`, `BrowserHost.mountEffect` and `Renderer.mount`. An embedded mount still computes its head, but never writes `document.title`, a head tag or a document attribute. Hosts on one document now share one baseline of the shell's values, which goes back to the document when the last host that wrote it is disposed.

Other changes:

- `Router.Settled.head` is now `Settled.title: string | undefined`.
- `Renderer.Prerendered` takes the head type as a second parameter.
- `Renderer.Hydration.adopted` is removed. `ssr` compares the server's head with the client's fold of the server's state, each instance evaluated when it adopts, including one that waited for its Layer. Hydration adopts a waiting child with the placement it had (props, slots and a headless closure), so its nodes and its subtree's head match the server, then applies the latest placement its parent rendered while it waited.
- `TestRoot.head` returns the root vocabulary's head. Write `root.head<HtmlHead.HtmlHead>()` to read an `Html` root's.
