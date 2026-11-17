# @effect/ui-kit

Unstyled components for [`@effect/ui`](../ui), ported from [Base UI](https://base-ui.com/). Each one owns the behaviour, ARIA and data attributes. Most draw their own unstyled markup and take your content in named slots, and you style them through the data attributes.

```ts
import { Switch } from "@effect/ui-kit"

// In a view:
Switch(h, {
  key: "notify",
  props: { checked: model.notify, name: "notify" },
  onEmit: ({ checked }) => Message.make({ _tag: "ToggledNotify", checked }),
  slots: { label: "Notifications" }
})
```

| Component | Base UI                                               |
| :-------- | :---------------------------------------------------- |
| `Switch`  | [Switch](https://base-ui.com/react/components/switch) |
