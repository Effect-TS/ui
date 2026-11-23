---
"@effect/ui": minor
---

The message log's Wire is now version 8. A Command run logs `CommandStarted` with its span when its fiber starts its work, so a run that is still going shows when it started. A run stopped before that has no `CommandStarted`. `CommandInterrupted` has a `reason`: `"interrupt"`, `"switch"`, `"unmount"`, `"layer"` or `"self"`. A `Failed` entry for a run whose result failed its instance carries the run's `issued`, and is that run's end. `TestHost.formatLog` and `formatTimeline` show the new entry and the reason.

Add `MessageLog.makeEncoded`, the queue and encoding fiber that `MessageLog.socket` used, for a sink that sends Wire frames somewhere else. A batch whose callback dies is dropped and logged, and later batches still go out. Add `MessageLog.isPlaceholder` to recognise the encoder's `~redacted`, `~unserialisable` and `~truncated` values. The docs now say which values the Wire sends in clear, a Subscription's key and deps and error message text, and that `Unmounted` also ends an instance's Subscriptions and any pending Layer.
