---
"@effect/ui-kit": minor
---

Add `Switch`, a switch ported from Base UI. It keeps no state, so it is a view function that takes no `key`: import it with `import { Switch } from "@effect/ui-kit"` and call it as `Switch(h, { props, onToggle, view })`. Draw its root with `parts.root({ element: h.button, children: [parts.thumb(h.span.class("thumb"))] })`: the root is a native `<button role="switch">` that carries the hidden form input. Both parts get Base UI's data attributes, the switch's own attributes win over the consumer's, and `onToggle` reports the value the user asked for, which the consumer controls.
