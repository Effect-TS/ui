---
"@effect/ui-kit": minor
---

Add `topLayer: false` to `Dialog`, `Drawer`, `Popover`, `Tooltip`, `PreviewCard`, `Menu`, `Select`, `Combobox`, `Autocomplete`, `ToastProvider` and `Positioning` to render a popup in place, positioned and clipped inside its containing block and never modal; popups still render in the top layer by default, unchanged. Separately, a positioned popup now also repositions when its explicit `collisionBoundary: { id }` element resizes.
