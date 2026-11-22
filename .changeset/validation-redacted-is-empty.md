---
"@effect/ui": patch
---

Unwrap `Redacted` values in `Validation`'s default `isEmpty` check so empty `Schema.Redacted(Schema.String)` and `Schema.Redacted(Schema.Array(...))` fields are treated as empty, triggering `required` without running rules.
