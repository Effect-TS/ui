---
"@effect/ui": patch
---

The document head sync comes with `HtmlHead`. A browser host in a bundle that never imports `HtmlHead` syncs only `document.title`. That is everything a tree can fold without `HtmlHead.vocabulary`. The one visible difference is a hand-built `HtmlHead` value given to the `head` member of `BrowserHost.makeHost` when `HtmlHead` isn't loaded: only its title is written. Import `HtmlHead` to sync the rest. The warning about an unmarked `<title>` before the marked one is kept in both cases.
