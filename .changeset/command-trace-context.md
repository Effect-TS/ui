---
"@effect/ui": minor
---

Add `Command.withParentSpan`, which continues an earlier Command's trace using the span context that `map` and `match` now pass as their second argument. Refetches caused by a Command's invalidation become children of its span.
