---
"@effect/ui": patch
"@effect/ui-kit": patch
---

Fix handlers installed by a headless part's `forward` callback dispatching to the consuming component instead of the part's component. Forwarded handlers, refs and mounts now use the part's ownership layer without replacing the consumer's.
