---
"@effect/ui-kit": minor
---

Add `Switch`, a headless switch ported from Base UI. Import it with `import { Switch } from "@effect/ui-kit"` and call it as `Switch(h, { ... })`. Its `root` part is a native `<button role="switch">` that carries the hidden form input, and `thumb` goes inside it. Both get Base UI's data attributes, and the switch emits `Toggled` for a value the consumer controls.
