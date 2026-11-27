---
"@effect/ui": patch
---

Add `QueryPersistence`: queries with `persist: true` save their results to a `KeyValueStore`, and after a reload show the saved value, stale, while they refetch. A failed refetch keeps the saved value.
