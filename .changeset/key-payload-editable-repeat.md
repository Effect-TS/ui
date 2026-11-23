---
"@effect/ui": minor
---

`Html.KeyPayload` gains `repeat` (from `event.repeat`) and `editable` (true when the event's innermost target via `composedPath()` is a `textarea`, `select`, text-like `input`, or `isContentEditable` element), and the new `HtmlKeyboard` module adds `HtmlKeyboard.shortcuts` and `HtmlKeyboard.Shortcut` to turn a table of single-key rows into a pure `keydown`/`keyup` handler for `HtmlSubscription.onDocument` or element `onKeyDown`. `HtmlScene.keydown` and `HtmlPlay.keydown` default `editable` from the located element, while `fireDocument` and `TestGlobalEvents.fire` default both to `false`.
