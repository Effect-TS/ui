---
"@effect/ui": minor
---

Add `expectLazyReused()` to `Scene` and `HtmlScene` to assert that every `h.lazy` call reuses its cached node on a repeat render of the current state, reporting each missed function and why it rebuilt.
