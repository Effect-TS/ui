---
"@effect/ui": patch
---

`TestHost.settle`, `root.pending()` and server rendering now wait for a lazy child drawn inside a headless component's `view` closure, instead of finishing while its fallback still shows.
