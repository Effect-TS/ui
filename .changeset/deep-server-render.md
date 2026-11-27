---
"@effect/ui": patch
---

`HtmlServer` no longer dies with a `RangeError` on a view nested a few thousand elements deep: it writes any tree it could render, and defers one too deep to render to the client.
