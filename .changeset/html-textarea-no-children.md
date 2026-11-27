---
"@effect/ui": patch
---

Make `h.textarea` take no children: use `.value(...)` to keep its value in sync with the model after user edits. Use `h.el("textarea")` for default text children.
