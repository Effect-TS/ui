---
"@effect/ui-kit": minor
---

Add `Select`, a headless select ported from Base UI. Call it as `Select(h, { ... })` with `items`, the options in order with their labels, and apply `select.trigger`, `select.value`, `select.positioner`, `select.popup`, `select.item` and the other parts to your own builders. `open` and `value` are controlled: the select emits `RequestedOpen`, `RequestedClose` and `Picked`, each with a reason, and `Settled` when its transitions end. Values are strings, and `multiple` selects several. Focus moves onto the items, with arrow keys, Home, End and typeahead, and back to the trigger when the popup closes. By default the popup covers the trigger with the selected item over the trigger's text, falling back to placing it next to the trigger when there isn't room or for touch. `name`, `required` and `autoComplete` add a hidden input next to the trigger, so a required select blocks its form's submission. In a `Field`, wrap the trigger and the positioner in `field.focusWithin` and draw the trigger with `field.member`.

`Positioning.TrackPositionArgs` and `Positioning.trackArgs` take a `leaveCoordinates` option, off by default: the mount still writes the CSS variables and reports the `Placement`, but leaves the positioner's `left` and `top` to the caller. The mount no longer places the positioner again when something inside it scrolls, such as a long list.
