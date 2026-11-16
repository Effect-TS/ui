---
"@effect/ui": minor
---

Components are now callable: declare a child slot with `Editor(h, { key, props })` instead of `h.child(Editor, { key, props })`. This works for plain, provided and headless components. Feature services render with `Todos.render(h, { ref, fallback })`. `h.child` is removed.
