---
"@effect/ui": minor
"@effect/ui-opentui": minor
---

Add an `onEmit` option to `Renderer.mount`, `BrowserHost.mount`, `HtmlHydrate.hydrate` and `OpenTuiHost.mount` that receives the root's typed events in emission order. `TestRoot.emitted` now records only the events a root delivered.
