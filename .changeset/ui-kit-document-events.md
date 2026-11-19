---
"@effect/ui-kit": patch
---

`Tooltip` hears Escape and outside presses through `Html.onDocument` in its `subscriptions` instead of a stream mount on the positioner. Behaviour is unchanged, apart from two things: a test can now fire them with `HtmlScene.fireDocument` or `TestGlobalEvents.fire`, and `s.subscriptions` lists the two keys while the tooltip shows. `ToastProvider` pauses its timers on the window's blur through `Html.onWindow`, so a `TestHost` test can fire it with `TestGlobalEvents.fire("window", "blur")`.
