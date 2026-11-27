---
"@effect/ui": patch
---

Spans opened by a command's work are now children of the command's span, and each query fetch runs in a span named after the query, with its `trigger` as an attribute.
