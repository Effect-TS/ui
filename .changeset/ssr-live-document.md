---
"@effect/ui": patch
---

In browser tests, `ssr` now hydrates initially open popovers and modal dialogs without throwing `InvalidStateError`. Such a page hydrates in a scope-owned iframe, so the returned `document` and `container` belong to its realm.
