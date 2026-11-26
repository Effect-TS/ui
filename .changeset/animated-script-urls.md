---
"@effect/ui": patch
---

Server rendering now omits an SVG `set` or `animate` element's `to`, `from`, `by` or `values` when it would set a `javascript:` or `vbscript:` URL on the URL attribute named by `attributeName`.
