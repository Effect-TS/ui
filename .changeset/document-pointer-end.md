---
"@effect/ui": patch
---

`DomSubscription.onDocument` also listens for `pointerup` and `pointercancel`, with the pointer payload, so a component can see a press end even when the browser cancels it and sends no `mouseup`. `HtmlScene.fireDocument` and `TestGlobalEvents.fire` fill in the pointer payload's defaults for them.
