---
"@effect/ui": patch
---

Compare plain objects and arrays structurally when checking component props and shared values for changes, avoiding `Equal.equals` hashing while preserving `Equal` behavior for cycles, custom `Equal` implementations, and non-plain objects.
