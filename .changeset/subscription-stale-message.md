---
"@effect/ui": patch
---

A Subscription's message is dropped when rendering the instance's ancestors stops its key first, as a query result already was. Before, `update` still got it. An `Html.onDocument` or `Html.onWindow` listener renders the ancestors before it runs, so a listener they remove cancels nothing, even with `preventDefault: "always"`, and one they keep uses its new handler and options.
