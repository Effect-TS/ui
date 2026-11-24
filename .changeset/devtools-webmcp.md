---
"@effect/ui-devtools": patch
---

Register the DevTools tools directly in the page through the experimental WebMCP API (`document.modelContext.registerTool`) when available. `DevTools.layer()` registers the 12 read and control tools under the `effect_ui_` prefix with `annotations.debugging: true`, gates `effect_ui_dispatch` behind `webMcp: { dispatch: true }`, supports `webMcp: false` to opt out, reads Wire frames only so `Schema.Redacted` values stay placeholders, and unregisters tools when the Layer closes.
