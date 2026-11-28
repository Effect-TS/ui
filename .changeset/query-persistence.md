---
"@effect/ui": patch
---

Add `QueryPersistence.layerKvs` and `persist: true` on queries to save results to a `KeyValueStore` and restore them stale across reloads while refetching. If a refetch fails, the saved value stays available.
