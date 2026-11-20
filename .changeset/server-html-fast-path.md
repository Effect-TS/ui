---
"@effect/ui": patch
---

The server renderer writes an element with no properties and canonical attribute names without building a map of its attributes, and skips the escaping `replace` for text and values with nothing to escape.
