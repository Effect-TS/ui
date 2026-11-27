---
"@effect/ui": patch
"@effect/ui-kit": patch
---

Keep the committed text and list open in `Combobox` and `Autocomplete` when Enter confirms an IME composition. The commit key's release now reports `composing: true`, even after `compositionend`.
