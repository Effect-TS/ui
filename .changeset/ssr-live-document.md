---
"@effect/ui": patch
---

In a browser, `ssr` now hydrates in an off-screen iframe removed when its Scope closes, so a popover open from the start or a dialog modal from the start no longer throws `InvalidStateError`. `document` and `container` then belong to the iframe's realm.
