---
"@effect/ui-devtools": patch
---

Scrubbing the inspector's **Page at** slider no longer makes the panel flicker or jump. The panel stays in the top layer unless a dialog or popover on the painted page would cover it. The slider, the "Paused at" badge and the Time travel button follow the entry you scrub to without waiting for its paint. While the page is paused, the instance list keeps a row for the selected entry's instance, and the pause notes take one line, cut short with the full text in a tooltip.
