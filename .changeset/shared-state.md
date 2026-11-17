---
"@effect/ui": minor
---

Let a headless component share part of its state with every component below it. `shares` on a headless component makes it an owner, `shared` on a reader types `h.shared` and `p.shared`, and `$.send(Owner, message)` sends to the nearest owner above. Reads and sends carry `Component.Shared<typeof Owner>`, which only the owner's `view` closure removes. `Story` gains a `shared` step, and `given` takes owners' values as a third argument. `Component.Send` is now a send to a child ref or to an owner, so `send.ref` can be `undefined`.
