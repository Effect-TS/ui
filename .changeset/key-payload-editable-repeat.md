---
"@effect/ui": minor
---

`Html.KeyPayload` gains `repeat` (from `event.repeat`) and `editable` (true when the event's innermost target via `composedPath()` is a `textarea`, `select`, text-like `input`, or `isContentEditable` element). `HtmlScene.keydown` and `HtmlPlay.keydown` default `editable` from the located element, while `fireDocument` and `TestGlobalEvents.fire` default both to `false`.
