---
"@effect/ui-kit": patch
---

Fix screen reader and keyboard accessibility in `Select`, `Combobox` and `Autocomplete`: modal popups isolate the page and keep Tab inside, unnamed controls get default names, chip removals are announced, and `Autocomplete` gains a `label` part. Filtering now matches across punctuation and accents, typeahead ignores case, and inline completion selects the suggested text.
