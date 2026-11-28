---
"@effect/ui": minor
---

Allow `Subscription.direct`'s `attach` to return `{ close, start }`, with `start` running outside the render that started the Subscription. Use it to emit a source's current value before subsequent changes.
