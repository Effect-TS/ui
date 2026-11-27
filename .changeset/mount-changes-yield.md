---
"@effect/ui": patch
---

Check for unread args and mount closure inside the same `Effect.callback` step that registers a `changes` waiter, so a mount reader can no longer sleep through a published update or close.
