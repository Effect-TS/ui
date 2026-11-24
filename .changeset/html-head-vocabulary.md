---
"@effect/ui": minor
---

The HTML head moved out of the `Html` vocabulary into `HtmlHead.vocabulary`. A component on `Html` now returns only `Head`'s entries from `head` (`Head.title`, `Head.titleTemplate`, `Head.reduce`). A component whose `head` returns `HtmlHead` entries, such as `meta`, `link`, `jsonLd` or `lang`, sets `elements: HtmlHead.vocabulary`. So does the root of a mount that should fold them. `HtmlHead.vocabulary` is `Html` with `HtmlHead.merge` as its fold. Under a root that has no fold of its own, the first instance on `HtmlHead.vocabulary` picks it.

An app that sets only the title no longer bundles the HTML head fold. `HtmlHead.attributes` and `HtmlHead.empty` are unchanged.
