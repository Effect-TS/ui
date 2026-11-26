---
"@effect/ui-kit": patch
---

Components mounted into a same-origin iframe from the parent window now handle pointer and focus events as they do in the page. Select, Menu, Combobox and DatePicker had treated the iframe's nodes as outside, because they checked them against the parent's DOM constructors.
