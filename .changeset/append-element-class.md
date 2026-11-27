---
"@effect/ui": minor
---

`Element.class` now appends class tokens after any existing classes on the builder instead of replacing them, skipping falsy tokens (`false`, `null`, `undefined`, `""`). Use `attr("class", value)` to replace or `attr("class", undefined)` to clear.
