---
"@effect/ui-kit": minor
---

Add `Switch`, a headless switch ported from Base UI. Import it with `import { Switch } from "@effect/ui-kit"` and call it as `Switch(h, { ... })`. Draw its root with `s.root({ element: h.button, children: [s.thumb(h.span)] })`: the root is a native `<button role="switch">` that carries the hidden form input. Both parts get Base UI's data attributes, the switch's own attributes win over the consumer's, and the switch emits `Toggled` for a value the consumer controls.
