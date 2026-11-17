---
"@effect/ui": patch
---

Preserve winning HTML attribute aliases during incremental updates and removals. The browser host canonicalizes attribute records before diffing through the new optional `Renderer.Host.normalizeAttrs` hook, while SVG names remain case-sensitive.
