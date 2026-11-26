---
"@effect/ui-kit": minor
---

Add `makeRadioGroup`, `makeTabs`, `makeToggleGroup`, `makeSelect` and `makeCombobox`, which take a string-encoded value schema such as `Schema.Literals` and type the selected value, the items, the value parts and the committed events with it. The existing exports are the `Schema.String` instances, so current code is unchanged.
