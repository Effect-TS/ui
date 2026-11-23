---
"@effect/ui-kit": minor
---

The parts of `Autocomplete`, `Combobox`, `Select`, `Menu` and `ContextMenu` that take more than the builder now take one options object, `{ element, ... }`, like every other ui-kit part. Each extra argument becomes a field of the same name: `select.item({ element: h.div, value })`, `menu.checkboxItem({ element: h.div, value, checked, closeOnClick })`, `combobox.itemIndicator({ element: h.span, value, keepMounted })`. The argument of `group` and `groupLabel` becomes the field `group`, the `group` of the items inside. A part whose extra fields are all optional still takes the object: `menu.trigger({ element: h.button })`, `combobox.clear({ element: h.button })`, `select.scrollUpArrow({ element: h.div })`. Parts that take only the builder, such as `ContextMenu`'s `trigger` and `Menu`'s `submenuTrigger`, are unchanged.
