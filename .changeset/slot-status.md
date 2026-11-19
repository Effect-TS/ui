---
"@effect/ui": minor
---

A provided Layer's status is now recorded state that a feature slot's `fallback`, server rendering, the MessageLog and Scene read. No view API changes.

Server rendering ships the status of a provided Layer that missed the budget or failed, and of each feature slot that showed its `fallback`, in the page state. Such an instance is no longer in `~deferred`: the client adopts its Model, and its feature slots keep the server's `fallback` nodes while their status matches. A client that adopts a `Failed` Layer doesn't build it again. The server's cause isn't shipped, so for a handled Layer failure the slot's `fallback` gets a cause that says a provided Layer failed on the server, with no stack, on the server and on the client alike: a fallback that shows its cause renders the same nodes on both, and the server's error isn't in the page. `~deferred` still lists failed children, `Redacted` state and Layers kept off the server.

`MessageLog.LayerPending` has a `status` field: `Pending` at mount, `Rebuilding` after a keyed provide selected again, and `Awaiting` for an instance the server rendered with its services that waits for the client's build. A Wire frame without the field is `Pending`.

`MessageLog.Mounted`, `Waiting` and `Update` have a `boundary` field: the `instance` of the provider whose Layer entries the instance's feature slots read. A plain child below a provider reads that provider's, and a component a pending provider's `fallback` placed reads the one above it, so a log reader doesn't infer it from paths. `MessageLog.LayerFailed` has a `redacted` field, `true` when the slots got the server's redacted cause rather than the logged one, on the server and on a client that adopted the failure.

A keyed provide whose new selection builds at once now logs `LayerReady` when its last Layer entry was a `LayerPending` or `LayerFailed`, so the log no longer ends on a status the screen left.

Scene has a `childPending` step that shows the pending branch of a slot's `fallback`. `childFailure` now also shows the failure branch in the view, as the runtime does, besides sending the parent's `onFailure` message.

A keyed provide that rebuilds doesn't keep the old view: its feature slots show their `fallback` until the new Layer is ready, as they did before. The `ProvideKeyed` docs now say so.
