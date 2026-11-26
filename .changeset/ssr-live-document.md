---
"@effect/ui": patch
---

In browser tests, `ssr` now hydrates popovers and modal dialogs open in the server render without throwing `InvalidStateError`, using a scope-owned iframe. Other pages still hydrate without a window, so opening these elements first on the client still throws.
