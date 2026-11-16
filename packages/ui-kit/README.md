# @effect/ui-kit

Unstyled components for [`@effect/ui`](../ui), ported from [Base UI](https://base-ui.com/). Each one owns the behaviour, ARIA and data attributes, and you draw the markup and style it.

```ts
import { Switch } from "@effect/ui-kit"

// In a view:
Switch(h, {
  key: "notify",
  props: { checked: model.notify, name: "notify" },
  onEmit: ({ checked }) => Message.make({ _tag: "ToggledNotify", checked }),
  view: (s) => h.label(s.root(h.button, s.thumb(h.span)), "Notifications")
})
```

| Component | Base UI                                               |
| :-------- | :---------------------------------------------------- |
| `Switch`  | [Switch](https://base-ui.com/react/components/switch) |
