---
"@effect/ui": minor
---

`Router.make` takes `restore: false` to save no snapshot of a page it leaves. A `Location` has its history entry's `index`, `Router.subscription`'s mapper gets the `Location` after the route, and `changes` emits again when Back or forward reaches another entry of the same route, or a push adds one for a `#hash`.
