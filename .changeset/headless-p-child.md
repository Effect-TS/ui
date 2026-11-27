---
"@effect/ui": minor
---

Add `p.child` to a headless component's `parts`, so a headless component can build on another: `parts` returns `p.child(Listbox, { props, onEmit, onFailure, parts })`, and the consumer's closure gets what the inner `parts` returns. The declaring component owns the child, so the child's events and failures go through its `update`, and `Scene.childEmit` now takes the events of a headless child that receives no messages.
