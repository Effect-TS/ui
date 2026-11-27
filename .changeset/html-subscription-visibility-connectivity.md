---
"@effect/ui": patch
---

Add `HtmlSubscription.onVisibility` and `HtmlSubscription.onConnectivity` (with `HtmlScene.visibility` and `HtmlScene.connectivity` for testing) backed by `Query.Visibility` and `Query.Connectivity`. Initialize `BrowserHost`'s `Query.Connectivity` from `defaultView.navigator.onLine` instead of always starting `true`.
