---
"@effect/ui-kit": patch
---

`Calendar` keeps focus inside the calendar when keyboard navigation or a new `month` prop changes the shown month, so focus lands on the new day and an enclosing `Field` isn't marked touched.
