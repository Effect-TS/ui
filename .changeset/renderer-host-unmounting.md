---
"@effect/ui": minor
---

Add an optional `Renderer.Host` hook, `unmounting(container, nodes)`, called before a closing mount's nodes are removed, so a terminal host can keep the final frame on screen.
