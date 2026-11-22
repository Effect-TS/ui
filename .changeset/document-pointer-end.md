---
"@effect/ui": patch
---

Follow a press from start to end with pointer events. An element's handlers take `pointerdown`, and `DomSubscription.onDocument` takes `pointerup` and `pointercancel`, all with the pointer payload. A `pointerdown` starts a press even when no `mousedown` follows, after a touch or a cancelled `pointerdown`, and `pointercancel` ends one the browser cancels, which sends no `mouseup`. `HtmlScene.fireDocument` and `TestGlobalEvents.fire` fill in the pointer payload's defaults for them.
