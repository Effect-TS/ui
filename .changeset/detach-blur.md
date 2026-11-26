---
"@effect/ui": patch
---

A render that removes or moves the focused element no longer sends `blur` or `focusout` in Chromium, matching the HTML standard and other browsers, so a `Field` isn't marked touched by a replaced keyed item.
