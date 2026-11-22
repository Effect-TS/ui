---
"@effect/ui": patch
---

`blur` and `focusout` handlers now get `{ disabled }`, the new `Html.BlurPayload`: whether the element that lost focus is disabled as the event fires, by its own `disabled` or by a `<fieldset disabled>` around it. A browser can send that `blur` while a render is still writing, before the components below have their new props, so a handler can tell it from a user leaving. `focusout` gets it next to `within`, as `Html.FocusOutPayload`. The `blur` payload was empty before, so handlers that ignore it still compile.
