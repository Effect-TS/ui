---
"@effect/ui": minor
---

Add `$.send("self", message)` to `update`, which sends one of the component's own `receives` messages to the nearest instance of its kind above, the one a `shared` entry with `owner: "self"` reads.
