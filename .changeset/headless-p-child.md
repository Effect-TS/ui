---
"@effect/ui": minor
---

Add `p.child` to a headless component's `parts`, so a headless component can build on another. `parts` returns `p.child(Listbox, { props, onEmit, onFailure, parts: (listbox) => ({ ...listbox, tags }) })`, and the consumer's closure gets what that inner `parts` returns, inferred with no annotations. Calls nest, so one component can own several children.

The declaring component owns the child. The child's events and failures go through its `update`. A child that fails shows nothing, the consumer's closure included, and the failure goes no further than `onFailure`. A throw in the inner `parts` fails the declaring component. `Story.parts` and `Scene` resolve the composed parts.

`Scene.childEmit` now takes the events of a headless child that receives no messages.
