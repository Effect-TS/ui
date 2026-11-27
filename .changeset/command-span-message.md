---
"@effect/ui": patch
---

Command spans now record a `message` attribute with the issuing message's `_tag`, or `"init"` for commands issued on mount.
