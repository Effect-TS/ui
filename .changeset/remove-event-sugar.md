---
"@effect/ui": minor
"@effect/ui-opentui": minor
---

Replace `on*` event methods with `on(event, handler, options?)`, including `onDoubleClick` with `on("dblclick", handler)`, custom-element methods with `on("color-changed", handler)`, and `onDrop(handler, options)` with `dropTarget(options).on("drop", handler)`; `onMount` is unchanged. Calls to `on` without options preserve `draggable` and `dropTarget` options in either call order.
