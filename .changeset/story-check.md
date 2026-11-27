---
"@effect/ui": patch
---

Add `Story.check`, which runs generated stories against a component and fails with the smallest failing one, written as Story steps with a `replay` token. Messages and Command results come from the definitions' Schemas, or from `messages` and `commands`, and an `invariant` runs after every step.
