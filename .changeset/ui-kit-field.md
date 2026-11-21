---
"@effect/ui-kit": minor
---

Add `Field`, a headless component ported from Base UI that groups a form control with its label, description and error. Call it as `Field(h, { props: { invalid, described }, view: (field) => ... })` and draw `field.root`, `field.label`, `field.control`, `field.description` and `field.error` on your own builders. The label points at the control, and the control lists the description and the shown error in `aria-describedby`, next to your own ids. `field.control` takes an `<input>`, `<textarea>`, `<select>` or `<button>`, and its result is another kit call's element: `Input(h, { element: field.control(h.input), props })`, or `checkbox.root(field.control(h.button))` for a `Checkbox` or a `Switch`.

Validity is controlled: validate in `update` and pass `invalid`. `true` sets `data-invalid` on every part, `aria-invalid` on the control and shows `field.error`, which is `undefined` otherwise, and `false` sets `data-valid`. The field keeps `data-focused` and `data-touched` itself, takes `dirty` and `filled` as props, and a `disabled` field disables its control. `field.description` fails the render unless `described` is set, so the control never misses it.
