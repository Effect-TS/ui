---
"@effect/ui": minor
---

`Renderer.Host` takes an optional `events`. A host that has it stores nothing per element: when an event fires, it hands the event's path to a lookup each mount connects, and the renderer reads each element's handlers from the tree it rendered last. `BrowserHost` and `TestHost` use it, so an app's elements no longer each hold a copy of their handlers. A host without it keeps getting `setEvents`.

Two changes are visible to an app:

- An event on a node that has left the tree no longer reaches the instance that rendered it.
- `TestHost.TestElement`'s `handlers`, `eventOptions`, `owners` and `dispatch` are read-only, and are read from the tree.
