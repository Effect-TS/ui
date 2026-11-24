---
"@effect/ui": patch
---

The document head fold and browser sync come with `HtmlHead`. A bundle that never imports `HtmlHead` folds and syncs only `document.title`. The one visible difference is a hand-built `HtmlHead` value given to the `head` member of `BrowserHost.makeHost` when `HtmlHead` isn't loaded: only its title is written. Import `HtmlHead` to sync the rest. The warning about an unmarked `<title>` before the marked one is kept in both cases.
