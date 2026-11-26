---
"@effect/ui": patch
---

A paused copy of the page now draws `Canvas.view` canvases from the paused state instead of leaving them blank. `Mount.make` and `Mount.makeStream` take an optional `paint` for this, and `BrowserHost.Painted` gains `skipped`, the instances whose element mount didn't run on the copy.
