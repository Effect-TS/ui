---
"@effect/ui": patch
---

Make the `MessageLog` say everything the tree does, so the entries alone give the state of every instance at every step.

Entries:

- Every entry has an `instance` number beside its `path`. A path names a place in the tree, and a child can mount there again before the instance that was there has logged `Unmounted`. The number is unique in the session. It's `0` on `SessionStarted` and `FetchStarted`.
- `Unmounted` is logged when the instance leaves the tree, not when its Scope finishes closing. An instance removed with its parent logs its own entry before its parent's.
- `CommandInterrupted` is logged when the run's fiber has exited, which is when `h.isRunning` stops counting it. A run with cleanup still going has no entry yet, so the entry can come after its instance's `Unmounted`.
- New `Waiting` entry: a hydrating instance whose Layer is still building logs it when it's created, with its props and the Model and loader state the server rendered. Its Layer entries follow as they happen, then `Mounted`.
- `Failed` and `Crashed` carry the instance's `component` and `props`, so an instance that fails in `init`, or whose Layer fails first, is described without a `Mounted` entry.
- When `update` throws, `Failed` has `update: { message, source }`: the message it was given and what sent it. Before, that message was in no entry.

The Wire has the same fields, and `MessageLog.wireVersion` is now `2`.

`Story.fromLog` replays a path that mounted more than once instance by instance, and returns the state of the last one.

Behaviour: an instance removed from the tree is closed at once. Before, an instance whose descendant's close was held open, such as by a Command's cleanup, kept taking messages, rendering and mounting children until that close finished.
