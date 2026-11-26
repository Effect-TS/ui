---
"@effect/ui": patch
---

`TestHost.settle`, `root.pending()` and server rendering now wait for a lazy child drawn inside a headless component's `view` closure or passed as slot content. If such a load fails, the server ships its fallback without deferring the whole author.
