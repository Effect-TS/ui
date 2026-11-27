---
"@effect/ui-kit": patch
---

Fix `Calendar` picking the previous day or losing moves during rapid keyboard navigation by navigating from logical focus and ignoring activation of the day being left while a month change is syncing.
