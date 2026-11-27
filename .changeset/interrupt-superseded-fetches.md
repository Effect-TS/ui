---
"@effect/ui": minor
---

A query entry's changed args now interrupt the fetch of its old args when nothing else needs it, instead of letting it run on to fill the cache.
