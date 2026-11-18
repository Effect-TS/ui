---
"@effect/ui": patch
---

Make what an `update` is given independent of when the render flush runs, and make the `MessageLog` say what each entry follows from.

Runtime:

- A message or a query result for an instance renders the dirty instances above it first. Its `update` reads the props those Models give it now in `$.props`, and an instance they no longer render is removed and takes no message. Before, a message that arrived between a parent's `update` and the flush was handled with the props of the last render, or by a child the parent had stopped rendering.
- The instance the message is for keeps its own view until the flush, so a field's event is never answered by writing an older value back into the field.
- A query whose args an `update` changed starts its fetch when that `update` returns, not at the flush. Two messages that each change the args, with no render between them, now fetch both: before, the first fetch started only when a flush happened to fall between them. Args that change with props still follow the render that passes the props.
- Nothing else renders earlier. Messages to an instance with nothing dirty above it, a keyed query's batched results and `Command.afterRefetch` still render once, in the flush.

`MessageLog`:

- Every entry can have `causedBy`, the `seq` of the entry it follows from (`MessageLog.Base`). An entry without it is a fact from outside the tree: a message from a DOM event, a Command's result, a Subscription or `root.send`, a query result, a Layer build or a run that ended. An entry with it is what the tree did about that fact: the messages its `update` sent on, the `PropsChanged`, `Mounted` and `Unmounted` of its render, the fetches its render started.
- `CommandInterrupted` names the entry whose handling stopped the run. `issued` still names the one that started it.
- A `FetchStarted` with trigger `"watch"` names the entry whose render declared the query's args. One a timer, a host signal or a Command's own work started names nothing.
- The entries of the first mount name `SessionStarted`.
- The Wire carries `causedBy`, and `MessageLog.wireVersion` is now `5`.

Testing:

- `TestHost.formatTimeline(entries)` prints the facts in order, each with its consequences indented under it.
- `TestHost.layer({ flush })` sets when a render flush runs among the test scheduler's tasks: `"queued"` (the default, as before), `"first"`, `"last"` or `{ seed }` (`TestHost.Flush`). Without the option, the config `EFFECT_UI_TEST_FLUSH` (`queued`, `first`, `last` or an integer seed) sets it, so a suite runs under another policy with no change to its tests.
