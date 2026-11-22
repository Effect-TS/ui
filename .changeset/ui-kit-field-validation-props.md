---
"@effect/ui": minor
"@effect/ui-kit": minor
---

Add `empty` to `Validation.Field` in `@effect/ui`, exposing the result of each field's `isEmpty` predicate on `NotValidated`, `Validating`, `Valid` and `Invalid`.

Add `fieldValidationProps` to `@effect/ui-kit`, mapping a `Validation.Field` to `Field`'s `invalid` (`true` for `Invalid`, `false` for `Valid`, `undefined` otherwise) and `filled` (`!field.empty`) props so callers can spread `...fieldValidationProps(state)` into `Field`'s `props`.
