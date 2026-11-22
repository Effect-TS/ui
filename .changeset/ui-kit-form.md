---
"@effect/ui-kit": minor
---

Add `Form`, a headless form ported from Base UI, which moves focus to its first invalid control after a submit. Import it with `import { Form } from "@effect/ui-kit"` and call it as `Form(h, { onEmit, view })`, drawing `form.root(h.form)` around the fields and the submit button. The root takes only a `<form>` and writes `novalidate`. It has no props and no data attributes.

Every submit emits `Submitted` with `fields` and `entries`, the form's named controls. Once the render that follows is committed, the form focuses the first element inside it with `aria-invalid="true"`, in document order, and selects the text of an `<input>`. An invalid element that can't take focus, such as the root of a radio group, passes it to the first element inside it that Tab can reach, and a native radio passes it to the checked radio of its group. With no invalid element the focus stays where it was. The consumer's `update` for `Submitted` runs before that render, so validating there with `Validation` and passing `invalid` to each `Field` is all the wiring a client-side check needs.

`Form` doesn't validate and holds no errors: `Validation` from `@effect/ui` does both. A control outside the `<form>` that names it with a `form` attribute isn't focused.
