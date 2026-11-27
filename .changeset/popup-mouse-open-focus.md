---
"@effect/ui-kit": patch
---

`Menu` and a `Combobox` with its input in the popup take focus back from the trigger when the press that opened them focuses it. `@effect/ui-kit` now needs `effect` 4.1.6, whose `Stream.merge` places popups before their first paint.
