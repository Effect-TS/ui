---
"@effect/ui": minor
---

`Html.InputPayload` and `Html.ValuePayload` gain `composing` and `inputType`, `Html.KeyPayload` gains `selectionStart` and `selectionEnd`, and `input` and `textarea` get a `compositionend` event (with the new `Html.CompositionPayload`). The browser host no longer writes a controlled `value` into a field while an input method composes text in it, and puts the Model's value back after `compositionend`; `HtmlScene` adds `compositionEnd` and lets `type`, `change` and `keydown` set the new fields.
