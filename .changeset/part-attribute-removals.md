---
"@effect/ui": patch
---

Let headless component parts remove consumer attributes with `attr(name, undefined)`, including boolean attributes such as `disabled(false)`. Attributes the part does not touch remain unchanged, and token lists still merge.
