---
"@effect/ui": minor
---

A click's payload now has `pointerType`: `"mouse"`, `"touch"` or `"pen"` from the `pointerdown` before it, or `""` for a click from the keyboard. `Html.PointerType` names the type. A `click` step in a `Scene` sends a mouse click; send another payload with `fire`.

A component can read the nearest instance of its own kind above it, as a nested menu or dialog reads the one it's in: `reads: { parent: { owner: "self", optional: true } }`. The entry must be `optional: true`, and the component must have `shares`. A `Story` or `Scene` of such a component reads only the values its `shared` steps give, never its own.
