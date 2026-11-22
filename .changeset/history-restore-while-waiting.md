---
"@effect/ui": patch
---

History restore keeps the state of a component that hadn't started when the page was left. A push made while a component waits for its provided Layer, or for a Model that decodes asynchronously, now saves the state that component was given, so Back restores it. And a component created by a Back takes that history entry's saved state over the server's while hydration is still settling, so what the user typed isn't replaced by the server render.
