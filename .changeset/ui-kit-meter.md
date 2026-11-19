---
"@effect/ui-kit": minor
---

Add `Meter`, a headless meter ported from Base UI, for a measurement within a known range such as disk usage. Import it with `import { Meter } from "@effect/ui-kit"` and call it as `Meter(h, { props: { value }, view })`, drawing `s.root(h.div)` with `s.label(h.span)`, `s.value(h.span)` and `s.track(h.div)` around `s.indicator(h.div)`. The root is a `<div role="meter">` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext`, and its `aria-labelledby` points at the label. The indicator adds its width after your inline style, and the parts expose `percentage` and `valueText`. Pass `valueText` to describe the value in your own words. It defaults to the rounded percentage, such as `"40%"`.
