---
"@effect/ui": patch
---

Add named slots, so a component with a `view` can take markup from its parent.

A definition lists its slots with `slots: ["title", "body"]`, and its view places each one with `h.slots.<name>`. A parent passes the content with `slots: { title, body }` when it declares the child. The content belongs to the parent: its handlers, its children's events and failures, `$.send`, refs and services all resolve there. Slots render on the client and the server, and hydrate.

`Component.Slots<C>` gives a component's slot names, `View.Outlet` is the node `h.slots.<name>` returns, and `View.Child` gains `slots`. `Story.make` takes `{ slots }` for a story of a slotted component, and a parent's story shows the content it passes. `View.textOf` and `View.nodes` include a child's slot content.
