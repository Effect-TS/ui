---
"@effect/ui-kit": minor
---

Add `Fieldset`, a headless fieldset ported from Base UI, for several fields under one legend. Import it with `import { Fieldset } from "@effect/ui-kit"` and call it as `Fieldset(h, { props: { disabled }, view })`, drawing `fieldset.root(h.fieldset)` around `fieldset.legend(h.div)` and the fields. The root takes only a `<fieldset>`, and its `aria-labelledby` points at the legend. A disabled fieldset writes the native `disabled`, so the browser disables every control inside it and the form submits none of them, and both parts get `data-disabled`. The parts expose `disabled`.

A `Field` inside a `Fieldset` now reads it and is disabled while the fieldset is, with nothing passed to it: `data-disabled` on its parts, its control disabled, its error hidden, its focus dropped, and `field.disabled` true. A control that loses focus because it was disabled, by the fieldset or by anything else, doesn't mark the field touched, and a field touched before stays touched. A field with no fieldset above it behaves as before. A nested fieldset doesn't read the outer one, so pass `disabled: outer.disabled || own` to it.

One value with one error, such as a checkbox group or a range slider, is still a single `Field` with `field.group` and `field.legend`.
