---
"@effect/ui-kit": patch
---

Fix `Dialog` and `AlertDialog` replacing the popup's element when a `keepMounted` modal opens. The kit's layer was added in front of the consumer's children as the dialog opened, so the renderer reused the first child's element for the layer and built a new one for every child after it, dropping what those elements held, such as a field's text or a scroll position. A closed `keepMounted` portal now keeps the layer, inert, as its first child, so the children keep their elements through open, close and reopen.
