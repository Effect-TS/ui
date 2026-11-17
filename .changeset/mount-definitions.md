---
"@effect/ui": minor
---

A mount is now a named definition. `Mount.make(name, { args }, run)` returns a factory, and `onMount` takes what the factory issues: `h.canvas.onMount(DrawChart({ points }))`. The inline forms `onMount(name, run)` and `onMount(name, input, run)` are removed.

The body is `(node, args, changes) => Effect`. It ends with its own result, which a view maps to a message with `Mount.map`, or with `Component.noop`. Annotate `node` with the host node the body needs: `onMount` rejects an element that renders to another kind of node. `changes` gives each new args, compared with the args Schema's equivalence instead of `Equal`. When a mount ends, its result goes through the `Mount.map` of the latest render, not the first.

`Mount.makeStream` defines a mount whose body is a Stream: it sends a message for each value, for as long as the element lives, for a widget that reports events such as an editor's changes.

An element takes one mount, and a second `onMount` on it throws. A render that gives an element a mount of another definition stops the running one and starts the new one, and a render that adds a mount to an element, or drops it, starts or stops it. Before, an element's mount only started when the element was created.

A scene names a mount by its definition: `mounted(DrawChart, result)` ends the rendered mount with the definition's own result, and `expectMount(DrawChart({ points }))` asserts on the args it rendered with. The log's `Mount` source carries the args, encoded for the Wire through the definition's Schema, with `Schema.Redacted` fields redacted.

A vocabulary that overrides `onMount` to return its own element class takes the new signature: one overload for an issued mount, plus the `View.MountHint` overload.
