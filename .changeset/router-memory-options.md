---
"@effect/ui": minor
---

Add `restore: false` to `Router.make` to skip history snapshots, and the history entry's `index` to `Location`. `changes` now also emits when Back, forward or a `#hash` push moves to another entry of the same route, and `Router.subscription`'s mapper gets the `Location` too.
