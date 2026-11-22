---
"@effect/ui": patch
---

`focus` handlers now get `{ focusVisible }`, the new `Html.FocusPayload`: whether the element matches `:focus-visible` as the event fires, which a browser shows for focus from the keyboard and not for focus from a press. It is `true` where the browser can't tell. The payload was empty before, so handlers that ignore it still compile.
