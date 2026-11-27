---
"@effect/ui": patch
---

`BrowserRouter` now skips view transitions for `popstate` navigations where the browser already ran a visual transition (`hasUAVisualTransition`), avoiding a second animation after swipe-back gestures. Custom `Router.History` implementations can pass the same `animated` flag to `listen`.
