---
"@effect/ui": minor
"@effect/ui-kit": patch
---

`update` reads shared state as `$.shared`, typed and named as `h.shared` is: each owner's value as the reader's `update` runs, or `undefined` for an optional owner that isn't above. A reader no longer copies the value into its Model with `onChange`, which is now for an `update` that must act on a change. Each reader's `Update` entry records what `$.shared` held, and `Story.fromLog` hands it back. `shares` in its long form takes an optional `schema` for the value, which the Wire encodes it through. Without one the value is sent as `MessageLog.structural` encodes it.

`Component.Update` gains a seventh type parameter, `SR`, for what `shared` lists, and `component.update` takes the shared values after the query results. The ui-kit `Tooltip` reads its provider's `instant` in `update`, so its `EnteredTrigger` message has no payload.
