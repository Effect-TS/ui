---
"@effect/ui": minor
---

`input` and `change` payloads report the field's `selectionStart` and `selectionEnd`, `input` and `textarea` get a `selectionchange` event (`Html.SelectionPayload`), and `HtmlCommand.select` takes an optional `{ start, end }` to select a range or place the caret.
