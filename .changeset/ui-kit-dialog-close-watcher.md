---
"@effect/ui-kit": minor
---

`Dialog` hears Android's back gesture. On Android, in a browser with `CloseWatcher` such as Chrome, the topmost open dialog holds a close watcher, and a back gesture emits `Dismissed` with the new reason `close-watcher`. A refused close keeps the dialog open as often as back is used. `AlertDialog` and dialogs nested or open side by side get the same, and only the topmost one hears back.

Firefox on Android has no `CloseWatcher`, so back doesn't reach the dialog there. Nothing changes on desktop or iOS.
