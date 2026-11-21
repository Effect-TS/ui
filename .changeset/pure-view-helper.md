---
"@effect/ui": minor
---

Expose `View.H<Msg>` for reusable pure view functions using the app's registered vocabulary, without tying them to a component definition. Shared view functions take the message as a type parameter: `<M>(h: View.H<M>, ...)`.
