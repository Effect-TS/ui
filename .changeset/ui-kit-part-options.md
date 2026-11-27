---
"@effect/ui-kit": minor
---

Parts of `Autocomplete`, `Combobox`, `Select`, `Menu` and `ContextMenu` with extra arguments now take `{ element, ... }`, even when those arguments are optional; for example, `select.item({ element: h.div, value })` and `menu.trigger({ element: h.button })`. Extra arguments become fields of the same name (`group` for `group` and `groupLabel`); builder-only parts still take the builder directly.
