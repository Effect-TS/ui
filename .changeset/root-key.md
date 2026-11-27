---
"@effect/ui": patch
---

Add an optional `key` to root mount and prerender APIs: use distinct keys when mounting the same component more than once in one document to avoid generated element ID collisions. Hydration reuses the server-rendered key automatically.
