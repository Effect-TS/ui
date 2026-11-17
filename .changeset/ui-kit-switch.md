---
"@effect/ui-kit": minor
---

Add `Switch`, an unstyled switch ported from Base UI. Import it with `import { Switch } from "@effect/ui-kit"` and call it as `Switch(h, { ... })`, with its visible name in the `label` slot. It draws a `<label>` around a native `<button role="switch">`, its thumb and the hidden form input, sets Base UI's data attributes on the root and thumb, and emits `Toggled` for a value the consumer controls.
