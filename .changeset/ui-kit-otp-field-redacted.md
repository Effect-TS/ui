---
"@effect/ui-kit": minor
---

`OTPField` now carries its verification code as `Redacted<string>` (`Schema.Redacted(Schema.String)`) in `OTPFieldProps.value`, in the `Updated`, `Completed` and `Rejected` event payloads, and on `otpField.value`, and keys its internal settlement subscription on non-secret state so the raw code never reaches message logs, server page state or history.

To update a caller, change the Model and message schemas to `Schema.Redacted(Schema.String)` and initialise the code with `Redacted.make("")`. `props: { value: model.code }` and `Updated: ({ value }) => Message.UpdatedCode({ value })` stay as written; transform a code with `Redacted.make(Redacted.value(value).toUpperCase())`, or wrap at the edge with `Redacted.make` and `Redacted.value` if the Model keeps a plain string.
