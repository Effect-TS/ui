---
"@effect/ui-kit": patch
---

`Dialog`, `AlertDialog`, `Drawer` and `Popover` fix several focus and screen-reader issues. A non-modal dialog now sets `aria-modal="false"`, so Chromium no longer reports it as modal. The focus ring now shows after the Tab trap wraps or a keyboard open. Focus no longer lands on `<body>` when the trigger is disabled, inert or hidden. The Tab trap now reaches editing hosts, `<details>` and media controls. A modal dialog inside a shadow root now hides the page around it and keeps Tab inside it.
