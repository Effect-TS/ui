---
"@effect/ui-kit": patch
---

Fix `Dialog` and `AlertDialog` replacing the popup's element when a `keepMounted` modal opens, which dropped what it held, such as a field's text or a scroll position. A closed `keepMounted` portal now keeps the kit's layer, inert, as its first child, so the consumer's children keep their elements through open, close and reopen.
