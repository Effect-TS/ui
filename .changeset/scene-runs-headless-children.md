---
"@effect/ui": minor
---

A `Scene` runs the `update` of every headless child it expands, so a click on a part such as a `Dialog`'s close goes through the child and on to the component that declared it, as in the app. The child's Commands, mounts and subscriptions still don't run.
