---
"@effect/ui": patch
"@effect/ui-kit": patch
---

Report `composing: true` on `keyup` payloads when the matching physical key's `keydown` composed, so handlers don't mistake the release of an IME commit key for an ordinary key press. Ignore composing `keyup` events in `Combobox` and `Autocomplete` so committing an IME composition with Enter keeps the committed text and open list.
