---
"@effect/ui-kit": patch
---

Components under a `DirectionProvider` no longer install CSS direction watchers, avoiding their computed-style reads on mount, focus and class changes.
