---
"@effect/ui-kit": minor
---

Add `Avatar`, a headless avatar ported from Base UI. Call it as `Avatar(h, { props: { src }, view })` and draw `s.root(h.span).children(s.image(h.img), s.fallback(h.span)?.children("AL"))`. Each part takes the consumer's builder and returns it. The image part returns the `<img>` once the source has loaded. The fallback part returns its `<span>` until then, or when the load fails, after an optional `fallbackDelay`. The parts also return `imageLoadingStatus`. The load goes through `Html.Images`, so a `TestHost` test settles it with `TestImages`.
