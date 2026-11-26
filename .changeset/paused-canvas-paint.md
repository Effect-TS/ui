---
"@effect/ui": patch
---

DevTools time travel now draws `Canvas.view` canvases from the selected state instead of leaving them blank. Custom mounts can provide a synchronous `paint` callback through `Mount.make` or `Mount.makeStream`; `BrowserHost.Painted.skipped` lists instance paths where a mount has no `paint` callback or the callback throws.
