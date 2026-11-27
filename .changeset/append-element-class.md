---
"@effect/ui": minor
---

`Element.class` now appends to existing classes instead of replacing them, skipping `false`, `null`, `undefined` and `""`. Use `attr("class", value)` to replace or `attr("class", undefined)` to clear.
