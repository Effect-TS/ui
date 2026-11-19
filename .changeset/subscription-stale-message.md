---
"@effect/ui": patch
---

A Subscription's message is dropped when rendering the instance's ancestors stops its key first, as a query result already was. Before, `update` still got it.
