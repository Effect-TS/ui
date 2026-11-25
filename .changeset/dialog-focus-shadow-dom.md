---
"@effect/ui-kit": patch
---

Fix focus handling in `Dialog`, `AlertDialog`, `Drawer` and `Popover`: preserve keyboard focus rings, skip disabled, inert or hidden focus-return targets, and include editing hosts, media controls and `<details>` without a summary in the Tab order. Non-modal dialogs no longer report as modal in Chromium, and modal dialogs inside shadow roots hide surrounding content from screen readers and keep Tab navigation inside.
