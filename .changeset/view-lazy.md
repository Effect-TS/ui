---
"@effect/ui": minor
---

Add `h.lazy(fn, ...args)`, which builds a node again only when one of its arguments changes. When the arguments are the same as the last render's, the view helper returns the last node and the runtime doesn't patch it if it holds only elements and text. In a list of 1,000 plain rows, selecting a row goes from about 4.7 ms to 1.1 ms.
