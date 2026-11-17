---
"@effect/ui": patch
---

Add `View.wrapPart(part, wrapper)` to preserve a headless part's service requirements when adapting its call signature, including options-object wrappers. The wrapper keeps its generic parameters and return type, and its requirements propagate to the headless component and its consumers.
