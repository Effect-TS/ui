---
"@effect/ui-kit": patch
---

`VirtualList`'s `viewport` takes `tabindex="0"` while its content overflows, so the keyboard can scroll a list with nothing focusable in it, and removing the focused item moves the focus to the item that takes its place instead of the page. An item with `role="row"` gets `aria-rowindex` instead of `aria-posinset` and `aria-setsize`, and `table` also takes a `<div>` for a grid built from `role="row"` items.
