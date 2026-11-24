---
"@effect/ui": minor
---

Add `Controllable.instance`, which finds a mounted instance of a root by the `instance` number its `MessageLog` entries carry. The `ControlledInstance` it returns has the instance's path, component name and message Schema, and a `dispatch` that sends it a message as the root's `send` does and completes with a `Dispatched`: `Updated` with the seq of the `Update` it logged, `Failed` with the seq of the `Failed` entry when `update` threw, or `Ignored` with the reason it ran no update.
