---
"@effect/ui": minor
---

Add `$.viewTransition(types?)` to `Component.Step`, which animates the DOM update an `update` causes with the browser's View Transitions API. `BrowserHost` runs the flush that renders it inside `document.startViewTransition`, tagged with `types` for `:active-view-transition-type(...)` CSS. Without the API, or when the user prefers reduced motion, the update commits once without animation. Any component can ask, not only the root, and a route change that `Router.push` delivers within its flush still animates. The first mount never animates, and hosts without a document ignore the request.

A host opts in with the new optional `Renderer.Host` member `viewTransition(update, types)`. The step's request is on `viewTransitionTypes`, and the log's `Update` entry records it as `viewTransition`.
