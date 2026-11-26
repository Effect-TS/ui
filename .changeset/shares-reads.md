---
"@effect/ui": minor
---

`shares` now receives `reads` alongside `model` and `props` (`({ model, props, reads }) => ...`), so an owner can share a value derived from the owners above it. Reading its own kind there needs a `schema` or an annotated return.
