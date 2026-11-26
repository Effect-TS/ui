---
"@effect/ui": patch
---

In browser tests, `ssr` now hydrates initially open popovers and modal dialogs without throwing `InvalidStateError`. Hydration uses a scope-owned iframe, so the returned `document` and `container` belong to its realm.
