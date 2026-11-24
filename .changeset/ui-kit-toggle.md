---
"@effect/ui-kit": minor
---

Add `Toggle`, a two-state button ported from Base UI. Call it as `Toggle(h, { props: { pressed }, onToggle: ({ pressed }) => msg }).class(["tool"]).children(["B"])`. It returns a native `<button>` builder with `type="button"`, `aria-pressed`, `data-pressed` and `data-disabled`, written when the button is built so they win over what you chain. A click sends `onToggle` with the value the user asked for, a disabled toggle sends nothing, and a toggle without `onToggle` sets no click handler. A click handler of your own throws when `onToggle` is given. Pass `element` to stack a part, such as a tooltip trigger, on the same button.
