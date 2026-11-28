---
"@effect/ui": minor
---

`Router.make` takes `restore: false` to save no snapshot of a page it leaves. A `Location` has its history entry's `index`, and `Router.subscription`'s mapper gets the `Location` after the route.
