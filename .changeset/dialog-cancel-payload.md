---
"@effect/ui": minor
---

The `cancel` payload of a `dialog` now has `cancelable`, which is `false` when the browser won't let a close request be cancelled and closes the dialog itself. The `close` that follows is the same request, so an app that reports each request once can skip it.
