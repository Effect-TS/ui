---
"@effect/ui-kit": minor
---

Add `Menubar`, a headless row of menus, as in a desktop application. Draw its root with `menubar.root` and put a `Menu` for each top-level menu inside it. Each menu's trigger becomes a `menuitem` in one roving Tab stop: the arrow keys and Home and End move along the bar, and Enter, Space and the arrow key across the bar open a menu. While a menu is open, hovering or focusing another trigger opens it, and an arrow key along the bar opens the next menu with `data-instant="group"`, so it can skip its transition. A vertical bar opens its menus at the inline end. `disabled` disables every menu of the bar, and a disabled menu hands the Tab stop to the next one.

`Menu`'s `Instant` adds `"group"`, and `MenuChangeReason` adds `"trigger-focus"`. A modal `Menu`'s layer over the page no longer blocks the pointer for the first frame before the trigger is cut out of it, which sent `mouseleave` and `mouseenter` to a trigger under a still pointer, and a menu that becomes modal while open now blocks the page. Its positioner also lets the pointer through until its first frames, since it can be painted before it is placed, and a popup at its unplaced corner took the hover from the trigger under a still pointer.
