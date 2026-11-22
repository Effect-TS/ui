---
"@effect/ui": patch
---

`mouseenter` and `mouseleave` handlers now get `{ x, y }`, the new `Html.HoverPayload`: where the pointer is in the viewport. An element drawn over another takes the pointer off the one below and gives it back once it is gone, with a `mouseleave` and a `mouseenter` at the same position, so a handler can tell that from the pointer leaving and coming back. The payload was empty before, so handlers that ignore it still compile.
