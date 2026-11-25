---
"@effect/ui": minor
"@effect/ui-opentui": minor
---

Remove the `on*` event methods, such as `onClick`, `onInput`, `onDoubleClick` and OpenTUI's `onMouseDown`, and the generated event methods of `Html.customElement`: use `on("click", handler)`, `on("dblclick", handler)` or `on("color-changed", handler)` instead. `onDrop(handler, options)` becomes `dropTarget(options).on("drop", handler)`, and `draggable` and `dropTarget` keep their options whichever order they and `on` are called in, when `on` is called without options.
