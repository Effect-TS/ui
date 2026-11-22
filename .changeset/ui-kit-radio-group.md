---
"@effect/ui-kit": minor
---

Add `RadioGroup`, a headless radio group component. Import it with `import { RadioGroup } from "@effect/ui-kit"` and call it as `RadioGroup(h, { props, onEmit, view })` with `value` and `items`. Draw it with `radioGroup.root(h.div)`, `radioGroup.radio({ element: h.button, value })` and `radioGroup.indicator({ element: h.span, value })`. It manages roving `tabindex`, wrapping arrow-key navigation (with `DirectionProvider` RTL support), indicator enter/exit transition states (`data-starting-style` / `data-ending-style` and `keepMounted`), `Field` and `Form` integration, and a hidden form input when `name` is set for an enabled checked item.
