---
"@effect/ui": minor
"@effect/ui-opentui": minor
---

Add a typed `onEmit` option to `Renderer.mount`, `BrowserHost.mount`, `HtmlHydrate.hydrate` and `OpenTuiHost.mount` that receives the root's events in emission order. `TestRoot.emitted` now records only delivered events.
