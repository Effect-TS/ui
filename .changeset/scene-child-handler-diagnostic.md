---
"@effect/ui": patch
---

A `Scene` click on a part only a headless child handles now points to `childEmit` and a `Play` instead of `givenChild`. Content a `Scene` passes into a slot reads the owners above the slot, as in the runtime, rather than one the receiving view wraps around it.
