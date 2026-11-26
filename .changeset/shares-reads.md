---
"@effect/ui": minor
---

`shares` now gets the component's `reads` as a third argument, so an owner can share a value derived from the owners above it. Reading its own kind there needs a `schema` or an annotated return.
