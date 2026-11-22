---
"@effect/ui-kit": minor
---

`VirtualList` follows content above it that changes size, scrolls with a container it doesn't render (`scrollContainer`), says where its items sit in a longer set (`setSize`, `firstPosition`), writes each item's size with `measure: false`, holds space for earlier items still to load (`reserveStart`), reports the exact scroll offset and the end of a scroll (`trackScroll`), renders a native `<tbody>` with spacer rows and a `table` part, and can place its items with transforms (`layout: "absolute"`).

`VirtualListEvents` gains `ScrolledTo` and `StoppedScrolling`, sent only with `trackScroll`. An `onEmit` handler object has to name every tag, so add the two (they can return `Option.none()`); an `onEmit` function needs no change.
