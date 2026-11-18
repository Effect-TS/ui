---
"@effect/ui-kit": minor
---

Add `Button`, a view function ported from Base UI. Call it as `Button(h, { onPress, children: ["Save"] })`. It returns the finished native `<button>`, whose `type` defaults to `"button"`. Pass `element: h.button.class("save")` for a class or your own attributes, and `props` for `disabled`, `focusableWhenDisabled` and `type`. A press sends `onPress` without cancelling the native action, a disabled button sends nothing, and a button without `onPress` sets no click handler, so the click reaches an ancestor's. An `element` with its own click handler throws when Button would set one, with `onPress` or `focusableWhenDisabled`. With `focusableWhenDisabled`, a disabled button stays in the tab order with `aria-disabled` and, once mounted, cancels its clicks, so a submit or reset button does nothing. Before mount, in server rendered HTML, nothing cancels them.
