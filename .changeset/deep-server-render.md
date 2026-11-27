---
"@effect/ui": patch
---

Prevent stack overflows when `HtmlServer` serializes deeply nested views, allowing views too deep to render to use their fallback and defer to the client.
