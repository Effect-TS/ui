---
"@effect/ui-kit": minor
---

Add `Button`, a view function ported from Base UI. Call it as `Button(h, { onPress }).class("save").children("Save")`. It returns a native `<button>` builder, whose `type` defaults to `"button"`, and writes its own attributes when the button is built, so they win over what you chain. Pass `props` for `disabled`, `focusableWhenDisabled` and `type`, and `element` to stack a part on the same button. A press sends `onPress` without cancelling the native action, a disabled button sends nothing, and a button without `onPress` sets no click handler, so the click reaches an ancestor's. A click handler of your own throws when Button would set one, with `onPress` or `focusableWhenDisabled`. With `focusableWhenDisabled`, a disabled button stays in the tab order with `aria-disabled` and, once mounted, cancels its clicks, so a submit or reset button does nothing. Before mount, in server rendered HTML, nothing cancels them.
