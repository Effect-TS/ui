---
"@effect/ui": patch
---

Add `toHaveAttributes(record)` to `Scene.Expect` and `toHaveStyle(record)` to `HtmlScene.Expect` (and `HtmlPlay`), which check several attributes or inline style declarations at once and report every mismatch. `toHaveStyle` matches declarations by exact name, ignoring spacing.
