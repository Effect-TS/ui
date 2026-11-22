---
"@effect/ui-kit": minor
---

Add `Popover`, a headless popover ported from Base UI: a non-modal `Dialog` placed next to its trigger by `Positioning`. Call it as `Popover(h, { ... })` and apply `popover.trigger`, `popover.portal`, `popover.backdrop`, `popover.positioner`, `popover.popup`, `popover.arrow`, `popover.title`, `popover.description` and `popover.close` to your own builders. `open` is controlled: the popover emits `Opened`, with the trigger's `id` and whether a press or a hover opened it, `Dismissed` with the reason, and `Settled`. A trigger with `openOnHover` opens the popover after the mouse rests on it, without taking focus. A popover takes several triggers, including a `PopoverTrigger` drawn elsewhere on the page.

`Dialog` gains `nested: false`, which keeps a dialog drawn inside another one out of the nesting, and returns `triggerId`, the `id` of the trigger it is open for. A dialog open with `initialFocus: false` now takes focus once `initialFocus` allows it.
