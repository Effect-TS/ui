---
"@effect/ui": patch
"@effect/ui-devtools": patch
---

With `DevToolsVite.plugin`, compatible component edits now redraw mounted instances without remounting, preserving their Models and running subscriptions. Incompatible edits fall back to a full reload.
