---
"@effect/ui": patch
---

Updates stop scanning a reused subtree, such as an unchanged `h.lazy` row, once it has been found to have no controlled properties. Subtrees that have them are still restored.
