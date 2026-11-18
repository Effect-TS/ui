---
"@effect/ui-kit": minor
---

Add `Input`, a view function ported from Base UI. Call it as `Input(h, { props: { value }, onUpdate: ({ value }) => msg })`. It returns a native `<input>` builder, so you chain classes and attributes such as `name`, `type` and `placeholder` on the result, and pass `element` to stack a part on the same input. The value is controlled: `onUpdate` reports each edit from the native `input` event, and the input shows `props.value` until you pass the new value back. `disabled` sets the native `disabled` and `data-disabled`, and a disabled input sends nothing. Input writes its `value`, `disabled`, `data-disabled` and `aria-disabled` when the input is built, so they win over what you chain under their lowercase names. An `input` handler of your own throws when `onUpdate` is given.
