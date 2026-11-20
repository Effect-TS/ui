---
"@effect/ui": patch
---

`BrowserHost` and the server renderer check each attribute name once and reuse the result, instead of testing it with a regular expression on every element.
