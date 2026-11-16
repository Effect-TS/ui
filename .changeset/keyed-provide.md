---
"@effect/ui": minor
---

`Component.provide` takes a keyed selection: `Component.provide(RoomView, { key: (props, model) => model.room, layer: (room) => Layer })`. The key is read from props and the Model once per flush and compared with `Equal.equals`. When it changes, the component keeps its Model, gets the new Layer, and remounts everything below it. Its in-flight Commands are interrupted, and its Subscriptions and loaders restart. Commands issued in the flush that changed the key run against the new services.

A `(props) => Layer` factory whose branches return different Layers now removes only the services every branch provides from the component's requirements.
