---
"@effect/ui": minor
---

Add `Command.withParentSpan` to continue a settled Command's trace in a later Command: `map` and `match` now receive the run's `SpanContext`. Refetches started by a Command's invalidation become children of that Command's span, and the `CommandStarted` and `FetchStarted` log entries record the parent.
