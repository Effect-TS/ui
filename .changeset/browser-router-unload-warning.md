---
"@effect/ui": patch
---

`BrowserRouter` now asks the browser to warn before the page unloads while a `Router.blocked` block is held, unless `warnOnUnload` is `false`.
