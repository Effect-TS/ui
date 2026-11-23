---
"@effect/ui": minor
---

Add `Component.lazy`, which loads a component from its own chunk with a dynamic `import()` the first time one of its children renders. The child shows its `fallback` while the module loads, `preload()` starts the load early, and `TestHost.settle` and `Scene` handle lazy children.
