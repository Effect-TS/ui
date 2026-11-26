---
"@effect/ui": patch
---

`root.pending()` now reports lazy children drawn in a headless component’s `view` closure or passed as slot content, and both `TestHost.settle` and server rendering wait for them. If that load fails, hydration keeps the server's fallback instead of rebuilding the component that drew it.
