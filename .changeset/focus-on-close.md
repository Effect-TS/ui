---
"@effect/ui-kit": patch
---

`Dialog`, and the `AlertDialog`, `Drawer` and `Popover` built on it, now move focus back as the close starts, not when the exit transition ends, and make the popup `inert` while it exits, so Tab and screen readers skip a popup that is on its way out. Focus that a press outside gave to the page or to another dialog stays there, and a touch that closes a dialog moves focus once the finger lifts. `PreviewCard` does the same: Escape with focus in the card focuses the trigger without opening the card again, and the card is `inert` through its exit.
