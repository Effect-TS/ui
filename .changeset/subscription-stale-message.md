---
"@effect/ui": patch
---

Drop a Subscription's message when rendering its instance's ancestors stops its key first, as a query result already is. `Html.onDocument` and `Html.onWindow` listeners render those ancestors before they run, so a removed listener cancels nothing and a kept one uses its new handler and options.
