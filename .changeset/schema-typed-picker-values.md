---
"@effect/ui-kit": minor
---

Add `makeRadioGroup`, `makeTabs`, `makeToggleGroup`, `makeSelect` and `makeCombobox` to preserve schema-defined string types across selected values, items, parts and selection events. Existing calls need no changes; the original components still use `Schema.String`.
