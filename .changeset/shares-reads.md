---
"@effect/ui": minor
---

`shares` gets the component's `reads` as a third argument, so an owner can share what it derives from the owners above it. To read its own kind there, give `shares` a `schema` or annotate what it returns.
