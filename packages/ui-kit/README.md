# @effect/ui-kit

Unstyled components for [`@effect/ui`](../ui). Each one owns the behaviour, ARIA, data attributes and any form field, and you draw the markup with your own `h` builders and style it. A component that keeps no state, such as `Switch`, is a plain view function and takes no `key`.

```ts
import { Switch } from "@effect/ui-kit"

// In a view:
Switch(h, {
  props: { checked: model.notify, name: "notify" },
  onToggle: ({ checked }) => Message.make({ _tag: "ToggledNotify", checked }),
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
- [Switch](src/Switch.ts): a controlled on/off setting.
