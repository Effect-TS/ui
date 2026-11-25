---
"@effect/ui": patch
---

A server-rendered field the user changes before its instance adopts now keeps the change. The host sends the field's state to its `input` and `change` handlers when it adopts, so the Model gets the edit, and puts the Model's value back if `update` doesn't take it, as it does for live typing. This covers an instance waiting for its Layer and a page where the user typed before the client script ran. Fields the user didn't touch get the Model's value as before. A `Hydration` can now have an optional `adoptProp`, which hydration calls instead of `setProp` on adopted elements.
