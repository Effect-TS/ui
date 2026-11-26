---
"@effect/ui": patch
---

Skip repeated restoration scans of unchanged subtrees, such as `h.lazy` rows, after the first scan finds no controlled properties. Subtrees with controlled properties still restore their values on each update.
