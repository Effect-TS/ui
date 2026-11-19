---
"@effect/ui": patch
---

Add `Composed`, an experimental prototype of Model-owned existence. `Composed.make` takes a definition and a `children` record of keyed collections: the children's Models are stored in the owner's Model, and which children exist follows the owner's Model, props and query results instead of what its view places. The view places a child that exists with `h.children`, and a component with an empty Model with `h.place`.
