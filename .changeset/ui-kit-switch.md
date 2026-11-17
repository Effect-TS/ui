---
"@effect/ui-kit": minor
---

Add `Switch`, an unstyled switch ported from Base UI. Import it with `import { Switch } from "@effect/ui-kit"` and call it as `Switch(h, { ... })`, with its visible name in the `label` slot. It draws a `<label>` around a native `<button role="switch">`, its thumb and the hidden form input, marks the label, root and thumb with `data-scope="switch"`, a `data-part` and Base UI's state attributes for styling, takes `aria-label`, `aria-labelledby`, `aria-describedby` and `id` for a switch named from outside the slot, and emits `Toggled` for a value the consumer controls.
