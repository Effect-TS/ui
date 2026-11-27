---
"@effect/ui": patch
---

Add `toHaveAttributes(record)` to Scene expectations and `toHaveStyle(record)` to HtmlScene and HtmlPlay expectations, reporting every mismatch. Style checks match inline declarations by exact name and ignore spacing around declaration separators.
