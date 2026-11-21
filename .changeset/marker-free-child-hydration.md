---
"@effect/ui": patch
---

Omit SSR hydration comment markers (`<!--[path-->` and `<!--]path-->`) around declared child components whose state is shipped, whose component provides no `Layer`, and whose view's root is an element. Hydration matches those children by element position when their path is in the shipped state, while still accepting marker pairs for backwards compatibility.
