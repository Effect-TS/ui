---
"@effect/ui": minor
---

Add an optional `Renderer.Host` member, `unmounting(container, nodes)`, which is called when a mount closes and before its nodes are removed. An inline terminal host can use it to keep the final frame on screen.
