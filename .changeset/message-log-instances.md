---
"@effect/ui": patch
---

Make the `MessageLog` say everything the tree does, so the entries alone give the state of every instance at every step, and give each entry one shape.

Entries:

- Entries about an instance have `path`, an `instance` number and `component` (`MessageLog.InstanceBase`). A path names a place in the tree, and a child can mount there again before the instance that was there has logged `Unmounted`. The number is unique in the session. `SessionStarted` and `FetchStarted` are about the tree and have `seq`, `at` and `session` only (`MessageLog.Base`). `MessageLog.InstanceEntry` is every entry about an instance.
- `Unmounted` is logged when the instance leaves the tree, not when its Scope finishes closing. An instance removed with its parent logs its own entry before its parent's.
- `CommandInterrupted` is logged when the run's fiber has exited, which is when `h.isRunning` stops counting it. A run with cleanup still going has no entry yet, so the entry can come after its instance's `Unmounted`.
- New `Waiting` entry: a hydrating instance whose Layer is still building logs it when it's created, with its props and the Model and query results the server rendered. Its Layer entries follow as they happen, then `Mounted`.
- `Mounted` carries the instance's query results as `queries`: the server's or history's when it adopted them, every query empty otherwise. `Waiting`, `Mounted` and `Update` each hold an instance's whole state, so a replay can start from any of them. A restored or hydrated instance no longer logs a `QueryChanged` per query after `Mounted`.
- `Failed` carries `props`, so an instance that fails in `init`, or whose Layer fails first, is described without a `Mounted` entry. Where it failed is `in` (type `MessageLog.FailedIn`, was `source` and `FailureSource`).
- When `update` throws, `Failed` has `update: { message, source }`: the message it was given and what sent it. Before, that message was in no entry.
- `Crashed` is gone. A failed root logs `Failed` then `Unmounted`, and a root `fallback` that throws logs a second `Failed` `in` `"fallback"`.
- A query's cache watch is no longer logged as `SubscriptionStarted` and `SubscriptionStopped` under a `~query/…` key. Its fetches are `FetchStarted` entries and its values `QueryChanged`.
- One interface per tag: `Lifecycle`, `SubscriptionChanged` and `CommandSettled` are replaced by `Unmounted`, `LayerPending`, `LayerReady`, `SubscriptionStarted`, `SubscriptionStopped`, `CommandEnded` and `CommandInterrupted`. `silent` is on `CommandEnded` only, and is a boolean.
- `Update.lists` and `Update.sends` are always arrays.

Sources:

- A query's `onChange` message has `{ _tag: "Query", name, seq }`, pointing at the `QueryChanged` entry it saw. It was `{ _tag: "Subscription", key: "~query/…" }`.
- A parent's `onFailure` message has `{ _tag: "Failure", path, seq }`, pointing at the child's `Failed` entry. It was an `Emit`.

The Wire has the same fields, with one Schema per tag, and `MessageLog.wireVersion` is now `3`.

`Story.fromLog` replays a path that mounted more than once instance by instance, and returns the state of the last one.

Behaviour: an instance removed from the tree is closed at once. Before, an instance whose descendant's close was held open, such as by a Command's cleanup, kept taking messages, rendering and mounting children until that close finished.
