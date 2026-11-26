---
"@effect/ui": patch
---

Prevent SVG `set` and `animate` elements from assigning `javascript:` or `vbscript:` URLs to links during server rendering, hydration and browser updates. Omit blocked `to`, `from` and `by` attributes, and the entire `values` attribute if any semicolon-separated item is blocked.
