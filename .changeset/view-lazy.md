---
"@effect/ui": minor
---

Add `h.lazy(fn, args)`, which builds a node again only when one of the arguments in the array `args` changes. When the arguments are the same as the last render's, the view helper returns the last node. If that node holds only elements and text, the runtime skips its patch and only sets its controlled properties again. In a list of 1,000 plain rows, selecting a row goes from about 4.7 ms to 1.1 ms.
