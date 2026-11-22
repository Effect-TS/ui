---
"@effect/ui": minor
---

Add `ElementBuilder.attrs`, which sets several attributes at once: `h.div.attrs({ id: "menu", role: "navigation" })` does the same as chaining `.attr` for each entry, and an `undefined` value removes that attribute.

The builder field that holds the attributes set so far is renamed from `attrs` to `elementAttrs`. Code that read `builder.attrs` must read `builder.elementAttrs`. A built `View.Element` still has `attrs`.
