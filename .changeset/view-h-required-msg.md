---
"@effect/ui": minor
---

Remove the `never` default from `View.H<Msg>`. Pass the message type explicitly: `<M>(h: View.H<M>, ...)` for shared view functions, or `View.H<never>` for components with `message: Schema.Never`.
