---
"@effect/ui": minor
---

`Component.provide` takes a keyed selection: `Component.provide(RoomView, { key: (props, model) => model.room, layer: (room) => Layer })`. The key is read from props and the Model once per flush and compared with `Equal.equals`. When it changes, the component keeps its Model, gets the new Layer, and remounts everything below it. Its in-flight Commands are interrupted, and its Subscriptions and loaders restart. Commands issued in the flush that changed the key run against the new services.

A key change doesn't clear the loader cache, which identifies an entry by the read and its args. A read whose args are unchanged gets the entry fetched under the old selection until its `staleTime` passes, so a read whose data depends on the selection should take the selection in its args.

A failed selection goes to `onFailure` or fails the instance, as at mount. The Commands waiting for that build are interrupted. While the key stays the same, a newly issued Command runs against the parent's services, so one that needs a selected service fails the instance. Every Subscription and loader on the instance waits for the next selection, including those that use only the parent's services; put work that must keep running on a component above the provide.

A `(props) => Layer` factory whose branches return different Layers now removes only the services every branch provides from the component's requirements.

Unmounting now waits for the cleanup of a component's Subscriptions, mounts and provided Layer, a build still running or failing included, before the services above it are released. A component that removed a child, Subscription or mount in an earlier update also waits for that cleanup before releasing its own services.
