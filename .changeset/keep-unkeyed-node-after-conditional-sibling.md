---
"@effect/ui": patch
---

An unkeyed element now keeps its node and mount when a preceding conditional sibling with a different tag comes and goes. Use a key to preserve node identity among same-tag siblings.
