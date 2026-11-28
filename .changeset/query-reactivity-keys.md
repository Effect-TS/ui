---
"@effect/ui": minor
---

Add `reactivityKeys` to `Query.Service`, `Query.InfiniteService`, and `Query.StreamService` so live cache entries invalidate when matching `Reactivity` keys are published, unregistering on collection or cache disposal. Report `Query.ReactivityMissing` once per query when `Reactivity` is absent from the cache context.
