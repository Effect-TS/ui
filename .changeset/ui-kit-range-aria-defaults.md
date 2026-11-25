---
"@effect/ui-kit": patch
---

Exclude the `Meter` and `Progress` NVDA helper span from copy-paste, hide `NumberField.scrubAreaCursor` with `aria-hidden="true"`, and remove English ARIA defaults from indeterminate `Progress`, `NumberField` inputs, and range `Slider` thumbs. Range sliders no longer default `aria-valuetext` to `"start range"` / `"end range"`, so name each thumb with `aria-label`.
