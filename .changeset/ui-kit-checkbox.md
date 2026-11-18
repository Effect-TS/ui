---
"@effect/ui-kit": minor
---

Add `Checkbox`, a headless checkbox ported from Base UI. Import it with `import { Checkbox } from "@effect/ui-kit"` and call it as `Checkbox(h, { props, onEmit, view })`. Draw it with `s.root(h.button).children(s.indicator(h.span))`: each part takes your builder and returns it. The root is a native `<button role="checkbox">`. When the checkbox has a form value to submit, `root` appends its hidden input after any children already on the button and before children you chain afterward. An `indeterminate` checkbox reports `aria-checked="mixed"` and `data-indeterminate`. Both parts get Base UI's data attributes, the checkbox's own attributes win over the ones set before the part, Enter doesn't toggle it, and it emits `Toggled` for a value the consumer controls.
