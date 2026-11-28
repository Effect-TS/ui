---
"@effect/ui": minor
"@effect/ui-devtools": minor
---

DevTools can stop recording a message `_tag` in one component, every instance of a component, or an instance and everything below it, from the panel's Stop recording menu, `exclude` or the `set_recording` MCP tool. Stopped entries, and the `PropsChanged` entries a stopped message causes, take no buffer slots, and rows already held that match are hidden until recording resumes. `PropsChanged` now shows under Everything instead of Messages.
