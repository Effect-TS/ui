---
"@effect/ui": patch
---

Don't report `RouteMismatch` when a static 404 hydrates at another unknown path, since both resolve to the catch-all route.
