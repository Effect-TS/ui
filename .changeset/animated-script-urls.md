---
"@effect/ui": patch
---

Server rendering, hydration and browser updates now omit a `set` or `animate` element's `to`, `from`, `by` or `values` when it holds a `javascript:` or `vbscript:` URL, so an animation can't put a blocked URL on a link.
