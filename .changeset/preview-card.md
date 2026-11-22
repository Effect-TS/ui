---
"@effect/ui-kit": minor
---

Add `PreviewCard`, a port of Base UI's Preview Card: a card that previews what a link leads to while the link is hovered or focused with the keyboard. The link keeps no ARIA of its own and the popup takes no focus, so the card adds to the link without replacing it. It opens after `delay` and closes `closeDelay` after the pointer leaves, lets the pointer cross diagonally from a short link to a wide card, closes on Escape, a press outside, or focus leaving, and has `backdrop`, `arrow` and `viewport` parts, several triggers, and `PreviewCardTrigger` for a link drawn elsewhere.

`Positioning.TrackPositionArgs` takes `inline` and `inlineHit`, to place a popup against one line of a link that wraps: the line the pointer rested on, kept by its index so a layout shift before the popup opens doesn't lose it, or without a hit, the line on the side the popup shows on. A hit is dropped while the props name another anchor. A popup that flips is placed against the line on its new side.
