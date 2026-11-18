---
"@effect/ui-kit": minor
---

Add `TooltipProvider`, which groups the tooltips below it. Once one tooltip in the group has been open, hovering another opens it at once instead of after its `delay`, until `timeout` (400 ms by default) after the last one closed, and its popup gets `data-instant="delay"`. The group follows the tooltips the consumer actually shows, through each tooltip's report of its `open` prop, so a refused close keeps it open and a close the consumer makes on its own starts the window. `Tooltip` needs no changes at the call site, and works as before with no provider above it.
