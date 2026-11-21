---
"@effect/ui-kit": minor
---

The `ToastProvider` viewport is now a manual popover, always shown, so it sits in the top layer. When a `Dialog` opens, the viewport shows itself again to stay in front of it, so its toasts take presses and F6 reaches them while a modal is open. A press on a toast doesn't close a dialog with `modal: true`, and Escape on a focused toast closes the toast, not the dialog.

`z-index` on the viewport no longer has an effect. The viewport keeps the browser's popover box, `inset: 0`, `margin: auto`, a border, padding, `overflow: auto` and the `Canvas` colors, so set the ones it needs in its CSS.
