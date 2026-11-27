---
"@effect/ui-devtools": patch
"@effect/ui": patch
---

Add per-tag examples to `get_message_schema`: ready payloads pass the dispatch decoder, templates carry `redacted` or `invalid`, and entries without a safe example omit `message`. Expose `MessageLog.redactSchema` to encode `Schema.Redacted` values as placeholders.
