---
"@effect/ui": patch
"@effect/ui-kit": patch
---

Add `DomSubscription.onCustomEvent` for listening to `CustomEvent`s on the host's document, with `HtmlScene.fireCustomEvent` and `TestGlobalEvents.fireCustomEvent` for testing. `GlobalEvents.listen` takes a `custom` option: with it the listener's payload is the event's `detail` and `defaultPrevented`, whatever the event's type. `@effect/ui-kit`'s detached triggers now reach their popup through `onCustomEvent`.
