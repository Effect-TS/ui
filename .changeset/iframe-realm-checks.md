---
"@effect/ui-kit": patch
---

Select, Menu and DatePicker mounted into a same-origin iframe from the parent window now handle presses as they do in the page. They had treated the iframe's nodes as outside, because they checked them against the parent's DOM constructors.
