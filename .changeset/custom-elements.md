---
"@effect/ui": minor
---

Add `Html.customElement`, which binds a web component to the HTML vocabulary with typed properties and events:

```ts
const ColorPicker = Html.customElement({
  tag: "hex-color-picker",
  properties: { color: Schema.String },
  events: { "color-changed": Schema.Struct({ value: Schema.String }) }
})

ColorPicker(h)
  .color(model.color)
  .onColorChanged(({ value }) => Message.PickedColor({ color: value }))
```

Each property gets a method that writes it as a JavaScript property, and each event a method named `on` plus its camelCased name, whose handler gets the `detail` decoded by the event's Schema. `HtmlScene.fireElement` and `HtmlPlay.fireElement` send a declared event with a typed `detail`.

The browser host now adds the `detail` of a `CustomEvent` on an element to its handler's payload, where it passed `{}`. A `CustomEvent`, or an event outside `Html.EventsOf`, that doesn't bubble reaches only its target's handler. On a custom element, `value`, `checked`, `selected` and `open` are plain properties, written only when they change, and the server renders none of them as attributes.
