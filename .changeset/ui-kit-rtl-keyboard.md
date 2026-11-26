---
"@effect/ui-kit": patch
---

Direction-aware controls now fall back to CSS `direction` when no `DirectionProvider` is present, including horizontal `Slider` keys, dragging and positions. `Slider` and `OTPField` leave browser shortcuts to the browser, `Slider` keys stop at the `minStepsBetweenValues` gap, unlabeled `OTPField` slots are named by the group and their position, and holding a key on a `Tabs` tab no longer repeats its click.
