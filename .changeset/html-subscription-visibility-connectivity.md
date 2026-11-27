---
"@effect/ui": patch
---

Add `HtmlSubscription.onVisibility` and `onConnectivity` to receive the current tab visibility and browser connectivity, then subsequent changes, with `HtmlScene.visibility` and `connectivity` for testing. `BrowserHost` now reports offline connectivity at startup when the browser is offline.
