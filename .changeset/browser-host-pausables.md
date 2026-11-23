---
"@effect/ui": minor
---

Add `BrowserHost.Pausables`, which `BrowserHost.mount` and `mountEffect` offer each root to, so a tool such as DevTools can show the page at an earlier state. A root's `pause` takes each instance's Model and query results by path, hides the root's container and paints the tree from them in an `inert` copy beside it. The copy runs no Command, Subscription, query, element mount or Layer build, logs nothing, leaves the head alone and takes no events, and shows a modal dialog or an auto popover as a manual popover, so it never makes the rest of the page inert. `pause` returns the paths it had no state for, which start from `init`. `resume` removes the copy and shows the live tree, which kept running while it was hidden.
