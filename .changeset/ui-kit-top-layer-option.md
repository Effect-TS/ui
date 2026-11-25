---
"@effect/ui-kit": minor
---

Add `topLayer: false`, which renders a popup in place instead of in the browser's top layer, like Base UI's portal given a `container`. `Dialog`, `Drawer`, `Popover`, `Tooltip`, `PreviewCard`, `Menu` (and so `Menubar` and `ContextMenu`), `Select`, `Combobox`, `Autocomplete` and `ToastProvider` take it, and `Positioning.PositionerFields` and `Positioning.TrackPositionArgs` carry it for popups of your own.

With `topLayer: false` the popup is an ordinary element where the view draws it, with no `popover` attribute and no `showPopover()`, so an ancestor's `overflow`, `position: relative` and stacking context apply to it. A closed positioner or portal is `hidden`, and a `Dialog`'s portal is a `<dialog open>` with no box of its own. `Positioning` measures `left` and `top` from the positioner's containing block instead of the viewport, and the default `collisionBoundary` becomes the area its ancestors' `overflow` leaves visible, so a popup flips to stay inside a small card. A popup in place is never modal, whatever `modal` says: opening it locks no scroll, hides nothing from screen readers and covers nothing beyond its containing block. A `Select` in place isn't aligned with its trigger, a submenu takes `topLayer` from its parent, and a `ContextMenu` in place defaults `positionMethod` to `"absolute"`. `AlertDialog` doesn't take it, since it is always modal.

When `topLayer` is left out, nothing changes.
