# @effect/ui-kit

Unstyled components for [`@effect/ui`](../ui). Each one owns the behaviour, ARIA, data attributes and any form field, and you draw the markup with your own `h` builders and style it. A component that keeps no state, such as `Switch`, is a plain view function and takes no `key`.

```ts
import { Switch } from "@effect/ui-kit"

// In a view:
Switch(h, {
  props: { checked: model.notify, name: "notify" },
  onToggle: ({ checked }) => Message.ToggledNotify({ checked }),
  view: (s) =>
    h.label(
      s.root(h.button.class("switch")).children(s.thumb(h.span.class("thumb"))),
      "Notifications"
    )
})
```

## Components

- [Avatar](src/Avatar.ts): an image with a fallback.
- [Button](src/Button.ts): a native button that can stay focusable while disabled.
- [Checkbox](src/Checkbox.ts): a controlled checkbox with an indicator.
- [Dialog](src/Dialog.ts): a popup in the top layer whose open state lives in your Model, as a modal, a focus trap or a non-modal panel, with `DialogTrigger` to open it from another component.
- [Field](src/Field.ts): a label, a description and an error for a form control, with its validity, touched and focused state.
- [Input](src/Input.ts): a native text input whose value lives in your Model.
- [Switch](src/Switch.ts): a controlled on/off setting.
- [Toast](src/Toast.ts): `ToastProvider`, a stack of notifications that components inside it post to, which close after a timeout.
- [Tooltip](src/Tooltip.ts): a popup shown when its trigger is hovered or focused, with `TooltipProvider` to open neighbouring tooltips without the delay.
