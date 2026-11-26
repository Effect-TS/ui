---
"@effect/ui": patch
---

Updates no longer scan reused subtrees, such as unchanged `h.lazy` rows, that have no controlled properties. Subtrees that have them are still restored.
