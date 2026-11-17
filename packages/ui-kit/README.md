# @effect/ui-kit

Unstyled components for [`@effect/ui`](../ui), ported from [Base UI](https://base-ui.com/). Each one owns the behaviour, ARIA and data attributes. Most draw their own unstyled markup and take your content in named slots. You style each element by passing classes and other attributes for it in `attributes`, or from a stylesheet through its `data-part` and state attributes.

```ts
import { Switch } from "@effect/ui-kit"

// In a view:
Switch(h, {
  key: "notify",
  props: { checked: model.notify, name: "notify" },
  onEmit: ({ checked }) => Message.make({ _tag: "ToggledNotify", checked }),
  slots: { label: "Notifications" },
  attributes: {
    root: { class: "h-5 w-9 rounded-full bg-gray-300 data-[checked]:bg-blue-600" },
    thumb: { class: "block size-4 rounded-full bg-white data-[checked]:translate-x-4" }
  }
})
```

| Component | Base UI                                               |
| :-------- | :---------------------------------------------------- |
| `Switch`  | [Switch](https://base-ui.com/react/components/switch) |
