---
"@effect/ui-kit": minor
---

Add `Menu`, a headless menu ported from Base UI. Call it as `Menu(h, { ... })` with `items`, every item in order with its label, and apply `menu.trigger`, `menu.positioner`, `menu.popup`, `menu.item` and the other parts to your own builders. Besides plain items there are link items, checkbox items, radio groups and radio items with their indicators, groups with labels, and separators. `open` is controlled: the menu emits `Opened` and `Dismissed` with a reason, `Picked` with the item's value and a checkbox's new state, `Highlighted` as the highlight moves, and `Settled` when its transitions end. Focus moves onto the items, with the arrow keys, Home, End and typeahead, and back to the trigger when the menu closes.

A submenu is another `Menu` drawn inside the parent's popup with `parentItem`, opened from the parent's item with `submenu.submenuTrigger`. It opens on hover by default, and the pointer can cross to it through a safe triangle. Picking an item in a submenu closes every menu above it, and `closeParentOnEsc` makes Escape do the same. `openOnHover`, `delay` and `closeDelay` open a root menu on hover too. A press held on the trigger and released over an item picks it. `modal`, the default, locks the page's scroll and blocks presses outside.

A menu can have several triggers, or one drawn elsewhere with `MenuTrigger`. The `viewport` part keeps the outgoing content on screen while the popup moves to another trigger, with `data-activation-direction` and `data-instant="trigger-change"`. The `query` prop filters the items, keeping focus in the `input` part, with `clear`, `empty`, `autoHighlight` and a locale-aware matcher that `menuFilter` also exports.
