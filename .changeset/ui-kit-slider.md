---
"@effect/ui-kit": minor
---

Add `Slider`, a headless slider ported from Base UI, with one thumb or a range. Call it as `Slider(h, { props: { value }, onEmit, view })`, where `value` is a number or an array with one number per thumb. Draw it with the `root`, `value`, `control`, `track`, `indicator` and `thumb` parts. `thumb` takes two builders, `s.thumb({ element: h.div, input: h.input })`: it sets up the input as a visually hidden `<input type="range">` and puts it inside the thumb, so what you set on the input stays, such as an `aria-label` or a Field's `f.control`. The slider handles dragging, presses on the track, and the arrow, Page, Home and End keys, and emits `Moved` for each value and `Committed` once a drag or key press is done. Positions go out as CSS variables on the thumb and indicator; the kit sets no layout. A range slider can't be wired to a Field yet.
