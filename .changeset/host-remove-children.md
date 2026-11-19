---
"@effect/ui": minor
---

`Renderer.Host` takes an optional `removeChildren(parent, nodes)`, which removes every node of a list at once. `BrowserHost` implements it, and clears a parent that holds nothing else in one step. A host without it keeps getting `remove` for each node.
