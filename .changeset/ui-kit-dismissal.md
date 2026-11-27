---
"@effect/ui-kit": minor
---

Add `Dismissal.TrackDismissal` so custom widgets can receive close requests through Dialog’s shared dismissal stack. Only the topmost layer accepting the reason receives the request, and its consumer decides whether to close it.
