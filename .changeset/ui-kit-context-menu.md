---
"@effect/ui-kit": minor
---

Add `ContextMenu`, a headless menu that opens at the pointer. Call it as `ContextMenu(h, { ... })` with a `Menu`'s `items` and parts, and draw the area that opens it with `contextMenu.trigger`. A right click opens it at the pointer and a touch held still for 500ms opens it under the finger, while the browser's own menu stays away from the trigger, the backdrop and the popup. It is always modal: Tab closes it and focus goes back to the element that had it. On macOS, releasing the right button over an item picks it. Several triggers can share one context menu, a context menu inside another one's trigger takes the right clicks on its own trigger, and a submenu is a `Menu` with `parentItem`, as in a menu.

`Menu` gets the same behaviour as a `contextTrigger` part, next to its `trigger`. A `Menu` without `parentItem` drawn inside another menu is now a menu of its own rather than a submenu.

`Positioning` takes a rectangle as `anchor`, as well as an element's `id`, and `trackArgs` passes it on as `anchorRect`. A point anchor, one with no size, reports `anchorHidden` only once it leaves the boundary. `resolveOptions` takes `shiftCrossAxis`, which keeps a popup on the anchor's side and slides it across the anchor to stay in the boundary.
