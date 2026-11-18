---
"@effect/ui": minor
---

A child call can leave out `key`. A child with neither a `key` nor a `ref` has the empty key, so its path is `Name[]`: `Switch(h, { props, onEmit })` and `Todos.render(h, { fallback })` work when the parent renders one child of that component. A second unkeyed child of the same component fails the parent, and the error asks for a `key`. Rows in a list still need keys. `key: ""` and no key name the same child. Passing both `key` and `ref` is still rejected.

Scene's child steps and `Scene.fallback` now take the child's component first, then its key or ref only when it has one, and find the child by both:

- `s.childEmit(Switch, event)` or `s.childEmit(TodoItem, "t1", event)`
- `s.childFailure(TodoItem, "t1", cause)` replaces `s.childFailure("t1", cause)`
- `s.givenChild(Menu, "actions", model)` replaces `s.givenChild("actions", model)`
- `Scene.fallback(view, TodoItem, "t1", result)` replaces `Scene.fallback(view, "t1", result)`

A step that matches no child, or several, throws.
