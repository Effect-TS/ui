---
"@effect/ui": patch
---

Add `Renderer.slowPhases`, an opt-in Layer that reports each `update`, view or flush that takes longer than its budget, and how long it took.
