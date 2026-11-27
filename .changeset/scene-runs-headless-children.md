---
"@effect/ui": minor
---

A `Scene` now runs the `update` of each headless child it expands, so a click on a part such as a `Dialog`'s close reaches the component that declared it, as in the app. The child's Commands, mounts and subscriptions still don't run.
