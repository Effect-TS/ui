---
"@effect/ui": patch
---

Run synchronous `HtmlCommand` ref operations (`Focus`, `Blur`, `ScrollIntoView`, `Measure`, `Select`, `RequestSubmit`, `ShowPicker`) in the committing task rather than waiting for the scheduler, so DOM focus and state are current before the next browser event.
