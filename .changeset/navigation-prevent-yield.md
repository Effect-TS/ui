---
"@effect/ui": patch
---

Prevent `HtmlScheduler` from yielding router navigation commands (`Router.push`, `Router.replace`, `Router.patchSearch`, `Router.back`, `Router.forward`, and `Router.load`) out of the render flush that issued them, so controlled inputs bound to route search params do not get overwritten by delayed route updates.
