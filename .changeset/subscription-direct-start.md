---
"@effect/ui": minor
---

`Subscription.direct`'s `attach` can return `{ close, start }`. `start` runs once the Subscription has started, outside the render that started it, so a source can send its current value before any change.
