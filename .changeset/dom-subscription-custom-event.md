---
"@effect/ui": patch
"@effect/ui-kit": patch
---

Add `DomSubscription.onCustomEvent` for listening to `CustomEvent`s on the host's document, with `HtmlScene.fireCustomEvent` and `TestGlobalEvents.fireCustomEvent` for testing. `BrowserHost` now passes a `CustomEvent`'s `detail` in its payload, and `@effect/ui-kit`'s detached-trigger channel uses `onCustomEvent` instead of a mutable closure slot.
