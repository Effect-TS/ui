---
"@effect/ui": patch
---

Server-rendered page state no longer repeats a settled query result for each instance that reads it. The instance state references the entry already shipped in `~query`, so the result is encoded once on the server and decoded once during hydration.
