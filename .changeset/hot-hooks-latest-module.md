---
"@effect/ui": patch
---

When a second copy of `@effect/ui` mounts a root in the same window, it takes over the hot reload hooks once the first copy has no mounted roots. Hot swaps and saves then reach the roots that are still mounted.
