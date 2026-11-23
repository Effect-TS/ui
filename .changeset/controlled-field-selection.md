---
"@effect/ui": patch
---

The browser host keeps a focused `input` or `textarea`'s selection when it writes the field's `value`, instead of the browser moving the caret to the end. A rejected edit, typed or composed with an input method, puts back the selection from before it. A value `update` normalized, such as uppercased text or digits grouped in fours, or a value the Model set, keeps each end of the selection with the unchanged text around it, and a caret at the end stays at the end. Fields the user isn't in, and input types without a selection such as `email`, are written as before.
