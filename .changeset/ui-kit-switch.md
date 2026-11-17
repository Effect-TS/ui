---
"@effect/ui-kit": minor
---

Add `Switch`, an unstyled switch ported from Base UI. Import it with `import { Switch } from "@effect/ui-kit"` and call it as `Switch(h, { ... })`, with its visible name in the `label` slot. It draws a `<label>` around a native `<button role="switch">`, its thumb and the hidden form input, and emits `Toggled` for a value the consumer controls.

Each of the label, root and thumb has `data-scope="switch"`, a `data-part` and Base UI's state attributes. The `attributes` prop takes classes and other attributes for each of them, such as `attributes: { root: { class: "...", "aria-label": "Mute" } }`, and the switch's own attributes win over those.
