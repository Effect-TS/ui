---
"@effect/ui-kit": minor
---

`VirtualList` follows content above it that changes size, scrolls with a container it doesn't render (`scrollContainer`), says where its items sit in a longer set (`setSize`, `firstPosition`), writes each item's size with `measure: false`, holds space for earlier items still to load (`reserveStart`), renders a native `<tbody>` with spacer rows and a `table` part, and can place its items with transforms (`layout: "absolute"`). After each scroll it also renders ahead in the direction it moved, as far as it moved, so a browser that scrolls off the main thread doesn't show blank rows.

`Scrolled` also carries the scroll `offset`, the viewport's `height`, the list's `length` and `scrolling`, and is emitted when a scroll starts and once it has ended. `trackScroll: true` emits it for each change of the offset too. The parts carry `scrolling` as well.

`count` is optional. With `keys`, the list has one item per key and `count` is ignored.
