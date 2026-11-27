---
"@effect/ui": patch
---

`TestHost.layer()` now provides a `Scheduler` to the Layers built on top of it, so `settle` and every `Play` step also run their fibers, such as a backend worker that several roots share. Provide it beneath the app's Layers with `Layer.provideMerge`.
