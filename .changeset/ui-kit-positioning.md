---
"@effect/ui-kit": minor
---

Add `Positioning`, the module that places `Tooltip`'s popup, for popups of your own. It is exported as a namespace: `import { Positioning } from "@effect/ui-kit"`.

- `Positioning.place` computes a popup's position from rectangles and options, without reading the DOM: the side and alignment it ended on after flipping and shifting, the space left for it, the arrow's offset and a transform origin.
- `Positioning.TrackPosition` is a stream mount for the positioner. It measures the anchor, writes the position and the CSS variables on the positioner, follows scrolling and resizes, and reports a `Positioning.Placement` when the side, the alignment, the anchor's visibility or the arrow's centring changes.
- `Positioning.PositionerFields` holds the positioning props to spread into a component's props Schema, `Positioning.trackArgs` turns them into the mount's args, and `Positioning.positionerStyle` and `Positioning.arrowStyle` give the inline styles the positioner and the arrow need.
