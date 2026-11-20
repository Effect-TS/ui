---
"@effect/ui": minor
---

`Component.define` takes a required `lifetime`, `"view"` or `"model"`. A `"view"` component is called in a view, `Row(h, { key, props })`, and lives while the view renders it. A `"model"` component is listed in its parent's `children` and lives while it is listed, shown or not, so a hidden tab or a wizard step keeps its Model, its Commands in flight and what the user typed into its inputs. A route page and the mounted root may be either. Every existing definition needs `lifetime: "view"` to keep its behavior.

`make` takes `children`: `Child.one(C, { props, onEmit })`, `Child.optional(C, ...)`, listed while `props` returns props, and `Child.keyed(C, ...)`, one child per `[key, props]` entry. A bare component is `Child.one(C)`. Props are a function of the parent's Model, and `onEmit` gets the event and the parent's Model as it is when the event arrives, shown or hidden. The view places each child with `h.children.profile()` or `h.children.rows(key)`, at most once per render, and may pass slot content. A child that no tree of the parent places keeps running out of the document, wherever the view leaves it out: not in what it returns, under a component root, or in a slot whose receiver doesn't show it. it still gets props, `$.send` and query results, and emits. Its element mounts stop until it is placed again, it contributes no head entries, and a ref lookup inside it finds nothing. The message log records `Detached` and `Attached`. A child's ref is named by its key: `Profile.ref("profile")`.

Calling a `"model"` component in a view, listing a `"view"` component in `children` and giving a headless component `lifetime: "model"` are type errors, and runtime errors through an erased type.

A server render writes no nodes for a child the view doesn't place and sends its state. The client adopts that Model and builds the child's nodes out of the document. `Renderer.Host` gains an optional `createContainer` to hold them. `BrowserHost` uses a `DocumentFragment`, and `TestHost` and the server host have one too. A host without it fails the parent of such a child.

A `Story` runs a component's `"model"` children with it, without a renderer: `s.children` holds their Models by key, hidden ones included, `.sendChild(key, message)` delivers a message to one, and their events, `init`'s included, reach the parent through `onEmit`. A send to a child the Model doesn't list is dropped, as in the renderer. A `Scene` clicks into a placed child's view. A Story runs a listed child's pure transitions only: it fails when the child runs a Command or sends outside its own listed children, which its own Story or `TestHost` covers.

`h.children` exists only in the view written in `make`: `Def.view` and `Component.Helper<typeof Def>` don't have it.
