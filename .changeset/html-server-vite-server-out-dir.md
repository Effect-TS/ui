---
"@effect/ui": minor
---

Add `serverOutDir` to `HtmlServerVite.plugin` to emit an importable production web handler (`handler` and `dispose`) with declaration types alongside client assets and prerendered HTML, and add `HtmlServer.Static` so prerendered pages hydrate stale while live request renders from the same bundle hydrate fresh.
