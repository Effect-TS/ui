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
  .on("color-changed", ({ value }) => Message.PickedColor({ color: value }))
```

Each property gets a method that writes it as a JavaScript property, and `on` takes each declared event, with a handler that gets the `detail` decoded by the event's Schema. `HtmlScene.fireElement` and `HtmlPlay.fireElement` send a declared event with a typed `detail`.

In the browser host, the payload of a `CustomEvent` on an element is now `{ detail }`, whatever its name. It was `{}`, or the HTML payload for a name such as `change`. A `CustomEvent`, or an event outside `Html.EventsOf`, that doesn't bubble reaches only its target's handler. On a custom element, `value`, `checked`, `selected` and `open` are plain properties, written only when they change, and the server renders none of them as attributes.
