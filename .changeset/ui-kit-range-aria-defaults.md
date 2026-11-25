---
"@effect/ui-kit": patch
---

Keep the NVDA helper span in `Meter` and `Progress` out of copied text with `user-select: none`, hide `NumberField.scrubAreaCursor` from assistive technology with `aria-hidden="true"`, and drop hardcoded English ARIA defaults on indeterminate `Progress`, `NumberField` inputs, and two-thumb `Slider` ranges. Range sliders no longer set default `"start range"` / `"end range"` `aria-valuetext`, so give each thumb its own accessible name.
