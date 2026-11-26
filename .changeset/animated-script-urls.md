---
"@effect/ui": patch
---

Server rendering, hydration and browser updates now omit an SVG `set` or `animate` element's `to`, `from`, `by` or `values` when it would set a `javascript:` or `vbscript:` URL on the attribute named by `attributeName`.
