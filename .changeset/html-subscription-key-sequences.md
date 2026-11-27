---
"@effect/ui": minor
---

Add `HtmlSubscription.keySequences`, a document shortcut table whose rows can take several keys in turn, such as `{ keys: ["g", "l"], message }`, within a `timeout` (one second by default). `HtmlSubscription.GlobalPayload` now carries the event's `timeStamp`, which the test tools default to `0`.
