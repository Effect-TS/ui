---
"@effect/ui": minor
---

Add `detached` to child declarations. `Profile(h, { key, detached: tab !== "profile" })` keeps the child mounted while its nodes are out of the document, so a hidden tab or a wizard step keeps its Model, its Commands in flight and what the user typed into its inputs. A detached child still gets props, `$.send` and query results, and emits through the latest `onEmit`. Its element mounts stop until it is attached again, it contributes no head entries, and a ref lookup inside it finds nothing. The message log records the new `Detached` and `Attached` entries.

A server render writes an empty range for a detached child and sends its state. The client adopts that Model and builds the child's nodes detached.

`Renderer.Host` gains an optional `createContainer`, which holds a detached child's nodes. `BrowserHost` uses a `DocumentFragment`, and `TestHost` and the server host have one too. A host without it fails the parent of a detached child.
