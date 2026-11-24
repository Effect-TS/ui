---
"@effect/ui": minor
---

Let a headless component share part of its state with every component below it. `shares` on a headless component makes it an owner, `reads` on a reader types `h.reads` and `p.reads`, and `$.send(Owner, message)` sends to the nearest owner above. Reads and sends carry `Component.Shared<typeof Owner>`, which only the owner's `view` closure removes. `Story` gains a `shared` step, and `given` takes owners' values as a third argument.
