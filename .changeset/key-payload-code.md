---
"@effect/ui": patch
---

`Html.KeyPayload` now includes `code` (`KeyboardEvent.code`, or `""` when unavailable) on element and document `keydown`/`keyup` payloads while preserving `key`. `HtmlScene`, `HtmlPlay`, and `TestGlobalEvents` key steps accept an optional `code` and default it to `""`.
