---
"@effect/ui": patch
---

Hot reload hooks on `window` now belong to the most recently loaded copy of `@effect/ui`, so a second copy in the same window no longer sends hot swaps to roots of the old one.
