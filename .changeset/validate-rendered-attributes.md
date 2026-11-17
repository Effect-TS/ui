---
"@effect/ui": patch
---

Drop unsafe attribute names in server HTML and the browser host. Normalize HTML attribute names to ASCII lowercase so duplicate names match the client's last-write behavior, while preserving SVG attribute casing.
