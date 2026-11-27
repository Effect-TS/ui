---
"@effect/ui": patch
---

Add `Renderer.slowPhases`, an opt-in Layer that reports each `update`, view or flush that takes longer than its budget, with the component's path and the time it took.
