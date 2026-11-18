---
"@effect/ui": minor
---

A child call can leave out `key`. A child with neither a `key` nor a `ref` has the empty key, so its path is `Name[]`: `Listbox(h, { props, onEmit, view })` and `Todos.render(h, { fallback })` work when the parent renders one child of that component. A second unkeyed child of the same component fails the parent, and the error asks for a `key`. Rows in a list still need keys. `key: ""` and no key name the same child. Passing both `key` and `ref` is still rejected.

Scene's child steps and `Scene.fallback` now take the child's component first, then its key or ref only when it has one, and find the child by both:

- `s.childEmit(Listbox, event)` or `s.childEmit(TodoItem, "t1", event)`
- `s.childFailure(TodoItem, "t1", cause)` replaces `s.childFailure("t1", cause)`
- `s.givenChild(Menu, "actions", model)` replaces `s.givenChild("actions", model)`
- `Scene.fallback(view, TodoItem, "t1", result)` replaces `Scene.fallback(view, "t1", result)`

A string selects a child rendered with that key, never one rendered with a ref. A step that matches no child, or several, throws. `givenChild` sets the Model of the one instance it found, at its path, and `Scene.fallback` checks the fallback against the view, closure or slot content that declared the child, as the runtime does.
