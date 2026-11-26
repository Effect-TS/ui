---
"@effect/ui": patch
---

`TestHost.settle`, `root.pending()` and server rendering now wait for a lazy child drawn inside a headless component's `view` closure or passed as slot content. If that load fails, hydration keeps the server's fallback instead of rebuilding the component that drew it.
