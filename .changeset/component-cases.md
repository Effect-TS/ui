---
"@effect/ui": patch
"@effect/ui-devtools": patch
---

Add `Case`, which names one state of a component (props, a starting Model, messages, a Layer) for `Play.fromCase`, `HtmlPlay.fromCase` and `BrowserCase.mount`. `DevToolsVite.plugin({ workbench })` serves each case at `/__workbench/<Component>/<key>` in the dev server.
