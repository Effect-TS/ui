---
"@effect/ui-kit": patch
---

`Dialog`, and so `Popover` and `Drawer`, no longer drop the click of a tap directly on the page that closes them when `modal` is `false` or `"trap-focus"`. Taps on a `modal: true` dialog, or on a non-modal dialog's own backdrop or viewport, still drop the click so it doesn't land on the page behind it.
