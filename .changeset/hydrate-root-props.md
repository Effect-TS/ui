---
"@effect/ui": patch
---

Add opt-in root props serialization with `includeProps: true` and decoding with `HtmlHydrate.decodeProps`; `hydrate` and `hydrateEffect` now propagate props Effect errors without changing the server HTML. Props or Models whose Schema has no JSON form are omitted from state with a warning instead of failing the render.
