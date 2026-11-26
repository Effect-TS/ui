---
"@effect/ui-kit": patch
---

Fix `Calendar` losing focus when the month changes while a day is focused. Focus now moves to the new day without marking an enclosing `Field` touched.
