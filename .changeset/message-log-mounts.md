---
"@effect/ui": patch
---

Record mount bodies in the `MessageLog`, including those that send no messages. Consumers that match entries exhaustively must handle two new tags:

- `MountStarted` records the name and args the body starts with. A mount's `Update` source now includes the start entry's `seq`, so readers can distinguish elements running the same mount.
- `MountEnded` identifies the start entry by `started`. Its `reason` is `"completed"` when the body returns, `"closed"` when its Scope closes first, or `"failed"` when it dies. Its `silent` flag is true when the body gave at least one result and every result mapped to `Component.noop`. Closing a Scope after the body completes does not produce another entry.

The Wire encodes the starting args through the mount's args Schema. `MessageLog.wireVersion` is now `6`.
