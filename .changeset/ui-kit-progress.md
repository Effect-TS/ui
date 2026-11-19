---
"@effect/ui-kit": minor
---

Add `Progress`, a headless progress bar ported from Base UI. Import it with `import { Progress } from "@effect/ui-kit"` and call it as `Progress(h, { props: { value }, view })`, drawing `s.root(h.div)` with `s.label(h.span)`, `s.value(h.span)` and `s.track(h.div)` around `s.indicator(h.div)`. A `null` value is indeterminate. The root is a `<div role="progressbar">` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext`, and its `aria-labelledby` points at the label. Every part gets `data-progressing`, `data-complete` or `data-indeterminate`. The indicator adds its width after your inline style, and the parts expose `status`, `percentage` and `valueText`. Pass `valueText` to describe the value in your own words. It defaults to the rounded percentage, such as `"40%"`.
