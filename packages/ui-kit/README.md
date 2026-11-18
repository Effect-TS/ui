# @effect/ui-kit

Unstyled components for [`@effect/ui`](../ui), ported from [Base UI](https://base-ui.com/). Each one owns the behaviour, ARIA, data attributes and any form field, and you draw the markup with your own `h` builders and style it. A component that keeps no state, such as `Switch`, is a plain view function and takes no `key`.

```ts
import { Switch } from "@effect/ui-kit"

// In a view:
Switch(h, {
  props: { checked: model.notify, name: "notify" },
  onToggle: ({ checked }) => Message.make({ _tag: "ToggledNotify", checked }),
  view: (s) =>
    h.label(
      s.root({
        element: h.button.class("switch"),
        children: [s.thumb({ element: h.span.class("thumb") })]
      }),
      "Notifications"
    )
})
```

| Component | Base UI                                               |
| :-------- | :---------------------------------------------------- |
| `Switch`  | [Switch](https://base-ui.com/react/components/switch) |
