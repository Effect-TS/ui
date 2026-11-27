---
"@effect/ui": patch
"@effect/ui-devtools": patch
---

Add `Case` to share component props, starting state, messages and service stubs between `Play.fromCase`, `HtmlPlay.fromCase` and `BrowserCase.mount`. Enable `DevToolsVite.plugin({ workbench })` to preview each case at `/__workbench/<Component>/<key>` in the dev server.
