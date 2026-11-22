---
"@effect/ui-kit": minor
---

`VirtualList` follows content above it that changes size, scrolls with a container it doesn't render (`scrollContainer`), says where its items sit in a longer set (`setSize`, `firstPosition`), writes each item's size with `measure: false`, holds space for earlier items still to load (`reserveStart`), reports the exact scroll offset and the end of a scroll (`trackScroll`), renders a native `<tbody>` with spacer rows and a `table` part, and can place its items with transforms (`layout: "absolute"`). After each scroll it also renders ahead in the direction it moved, as far as it moved, so a browser that scrolls off the main thread doesn't show blank rows.

`VirtualListEvents` and the `onEmit` of a list without `trackScroll` stay as they were. Pass `trackScroll` as `true` or a `boolean` and `onEmit` takes `VirtualListTrackedEvents`, which adds `ScrolledTo` and `StoppedScrolling`.
