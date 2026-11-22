---
"@effect/ui-kit": minor
---

Add `Tooltip`, a headless tooltip ported from Base UI. Call it as `Tooltip(h, { ... })` and apply `tooltip.trigger`, `tooltip.positioner`, `tooltip.popup` and `tooltip.arrow` to your own builders, each returning the builder for you to chain and add children to: `tooltip.trigger(h.button.class("tool")).children("B")`. A part's result can also be another kit call's `element`, such as a ui-kit Button's. The tooltip opens after the pointer rests on the trigger or when the keyboard focuses it. It closes when the pointer leaves, focus moves away, the user activates the trigger, Escape is pressed anywhere, or the mouse is pressed outside the tooltip. `open` is controlled: the tooltip emits `RequestedOpen` and `RequestedClose`. The positioner is a manual popover in the top layer, placed against the trigger with CSS anchor positioning from the `side`, `align` and `sideOffset` props, and the gap is part of the positioner so the pointer can cross it to the popup.
