---
"@effect/ui-kit": minor
---

Add `Avatar`, a headless avatar ported from Base UI. Call it as `Avatar(h, { key, props: { src }, view })` and draw `s.root({ element: h.span, children: [s.image({ element: h.img }), s.fallback({ element: h.span, children })] })`. Each part returns a finished element, and `root` also takes a bare builder so another part can stack on it. The root loads the image in the browser. The image part returns the `<img>` once it has loaded. The fallback part returns its `<span>` until then, or when the load fails, after an optional `fallbackDelay`. The parts also return `imageLoadingStatus`.
