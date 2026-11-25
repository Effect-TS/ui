---
"@effect/ui-kit": patch
---

`Tooltip` stays open while the pointer crosses the triangle between the trigger and a wider popup, and only focus that shows a focus ring opens it, so a dialog closed with the mouse no longer pops it open on focus return. Add `describesTrigger`, which makes the popup the trigger's accessible description.
