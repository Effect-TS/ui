---
"@effect/ui-kit": patch
---

`Menu` reads checked state from a `checked` field on its `items`, so checkbox and radio items and their indicators render correctly in any construction order. `checkboxItem` no longer takes `checked`, and `radioGroup` takes only the builder.
