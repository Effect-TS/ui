---
"@effect/ui": minor
---

Expose `Html.H<Msg>` (and `OpenTui.H<Msg>`) for reusable pure view functions without tying them to a component definition. Shared view functions take the message as a type parameter: `<M>(h: Html.H<M>, ...)`.
