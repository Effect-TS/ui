---
"@effect/ui": patch
---

Add `Validation`, field validation for forms. `Validation.make` takes each field's `required` message and rules, and returns a `State` Schema for the Model, `change`, `blur`, `submit` and `reject` to record what happened, and `validate`, which derives each field as `NotValidated`, `Validating`, `Valid` or `Invalid`. `checklist` lists every rule of a field as met or unmet. `Validation.Rule` has Foldkit's rules, and an async check is a query whose result is passed to `validate`.
