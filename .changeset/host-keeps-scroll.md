---
"@effect/ui": patch
---

`BrowserHost` keeps the page's scroll position when showing a modal dialog or a popover moves focus. A browser focuses something inside a `<dialog>` as it shows it and scrolls to it, which moved the page when the dialog's content wasn't in view, such as a popup still waiting to be placed.
