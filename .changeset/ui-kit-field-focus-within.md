---
"@effect/ui-kit": minor
---

`Field` now has a `focusWithin` part for a single control whose focus moves into a popup, such as a select or combobox. Wrap the trigger and the popup's positioner in `field.focusWithin(h.div)` and draw the trigger with `field.member`. Focus moving inside keeps `data-focused` and does not touch the field; leaving the wrapper touches it. Unlike `field.group`, `focusWithin` writes neither `role` nor `aria-labelledby`, leaving naming to the control's own label part.
