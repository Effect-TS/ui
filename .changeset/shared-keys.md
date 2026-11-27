---
"@effect/ui": patch
"@effect/ui-kit": patch
---

Add `Component.sharedKey`: a reader can name an owner by a key holding only its name and Schemas, so a reader rendered alone doesn't bundle the owner. `Menu`, `Select`, `ToggleGroup` and `Checkbox` read `Menubar`, `Toolbar` and `CheckboxGroup` by key, and no longer bundle them.
