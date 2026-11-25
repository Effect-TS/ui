---
"@effect/ui-kit": minor
---

Add `topLayer: false` to `Dialog`, `Drawer`, `Popover`, `Tooltip`, `PreviewCard`, `Menu`, `Select`, `Combobox`, `Autocomplete`, `ToastProvider` and `Positioning`, which renders the popup in place, placed and clipped inside its containing block and never modal, instead of in the top layer, which stays the default. Separately, a positioned popup now also repositions when the element of an explicit `collisionBoundary: { id }` resizes.
