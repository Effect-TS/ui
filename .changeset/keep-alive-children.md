---
"@effect/ui": minor
"@effect/ui-kit": minor
---

Add keep-alive children. A view writes them inside `h.keepAlive`, calling a component with the `s` it passes in place of `h`: `h.keepAlive((s) => Profile(s, { key: "profile" }))`. Keeping is decided at the call, so one component can be kept in one view and unmount in another. Every component called with `s` is kept, so a child in the block that should unmount is called with `h`. A headless component or a feature's `render` takes `s` as it takes `h`, and isn't kept. A lazy component called with `s` is kept from its first placement, its fallback with it while the module loads. A child whose call changes from `h` to `s` between renders keeps its instance and is kept from then on. Changed back, it's an ordinary child again.

A keep-alive child belongs to the component whose view called `h.keepAlive`, at `Name[key]` under it wherever the view puts it, so a move to another element or into a slot keeps the instance. It starts the first time it's placed in the tree while its predicate holds: one written into a slot nothing places hasn't started, and a `$.send` to it is dropped. While no view writes it, its nodes leave the document and it keeps its Model, its Commands in flight, its Subscriptions and what the user typed into its inputs. Its element mounts stop, it adds nothing to the head or to `collects`, and its events reach the author through the `onEmit` of the last render that placed it. The message log records `Kept` and `Drawn`.

Without a predicate the children of an `h.keepAlive` live as long as their author. `h.keepAlive(({ key, model }) => key in model.rows, (s) => ...)` ends each child once the predicate is false for its key. The runtime asks it on every render of the author. A predicate that reads none of `model`, `props` or `queries` from its argument fails the author. So does placing one `Name[key]` twice in a render, and so do an ordinary child and a keep-alive child of the same name and key that resolve to one path, such as one component written with `h` and with `s` at one key in one render.

Server state and history snapshots hold the Model of a kept child, and of a child that hasn't started, with everything below it. The state belongs to the author it arrived with, and the child takes it when it starts. On the client a child adopts the server's nodes only where the server drew it. Placed anywhere else, it keeps the state and builds new nodes.

`Renderer.Host` gains an optional `createContainer`, which holds a kept child's nodes. `BrowserHost` uses a `DocumentFragment`, and `TestHost` and the server host have one too. A host without it fails the author of a kept child.
