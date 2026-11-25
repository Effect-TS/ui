---
"@effect/ui-kit": patch
---

A tap directly on the page that closes a `Dialog`, `Popover` or `Drawer` with `modal: false` or `"trap-focus"` now reaches what it landed on. Taps on a `modal: true` dialog, or on a dialog's own backdrop or viewport, still drop their click.
