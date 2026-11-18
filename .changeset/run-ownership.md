---
"@effect/ui": minor
---

A Command run is over when its fiber exits, not when it's asked to stop. An interrupted run, by `switch`, `Command.interrupt` or its instance going, holds its group until its cleanup has finished: a `switch` or `queue` run issued after it starts only then, and `h.isRunning` stays true until then. `TestHost` shows such a run as `stopping`, and `CommandInterrupted` is logged when its fiber exits. A defect in that cleanup is reported as `Command.CleanupFailed` and doesn't fail the instance or the run that replaced it.

`mode: "drop"` is removed. `update` applied its Model change even when the run was dropped. Keep what `update` needs to know, such as a `Submitting` state, in the Model and issue nothing while it holds. `Steps.dropped` and the `"mode"` reason of `CommandDropped` go with it.

Detached runs are removed. Every run is owned by the instance that issued it and ends with it, wherever its service is provided. A save that must outlive a page is issued by a component that outlives it, such as the layout. The `detached` fields of `CommandEnded`, `CommandInterrupted` and `TestHost.PendingCommand` are removed, and the MessageLog wire version is now 4.

Every run gets a Scope of its own, closed with the run's exit. An instance's close stops its runs and waits for their cleanup before the Layer it was provided with is released.
