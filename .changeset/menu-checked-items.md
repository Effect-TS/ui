---
"@effect/ui-kit": patch
---

`Menu` checkbox and radio items and their indicators now read `checked` from `items`, so selection no longer depends on construction order. Set `checked` on each item entry rather than on `checkboxItem`, and pass only the builder to `radioGroup`: `menu.radioGroup(h.div)`.
