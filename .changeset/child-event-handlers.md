---
"@effect/ui": patch
---

Allow `onEmit` to accept one handler per tagged child event. Each handler receives its matching event and can return a parent message or `undefined` to ignore it.
