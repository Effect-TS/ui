---
"@effect/ui": minor
---

Add `interruptPrevious` to `queries` entries: when the args change, the fetch for the old args is interrupted unless something else still needs it, and the new args fetch at once.
