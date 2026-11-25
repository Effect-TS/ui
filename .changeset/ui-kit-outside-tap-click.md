---
"@effect/ui-kit": patch
---

`Dialog`, and so `Popover` and `Drawer`, no longer drop the click of a tap outside that closes them, unless the dialog has `modal: true`. With `modal: false` or `modal: "trap-focus"`, a tap on a button of the page closes the dialog and presses the button, as a mouse click already did and as Base UI does. A modal still drops it, so the tap doesn't land on the page under its layer.
