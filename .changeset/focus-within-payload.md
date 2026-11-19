---
"@effect/ui": patch
---

`focusin` and `focusout` handlers now get `{ within }`, the new `Html.FocusWithinPayload`: whether the other end of the move is inside the handler's element. For `focusin` that is where focus came from, and for `focusout` where it goes, so an element can tell focus moving between its descendants from focus arriving or leaving. The payload was empty before, so handlers that ignore it still compile.
