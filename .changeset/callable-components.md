---
"@effect/ui": minor
---

Components are now callable: declare a child slot with `Editor(h, { key, props })` instead of `h.child(Editor, { key, props })`. This works for plain, provided and headless components. Feature services render with `Todos.render(h, { ref, fallback })`. `h.child` is removed.

Calling a component whose props are erased, such as a `Component.Any` or a component defined with `props: Schema.Any`, now requires `props`, even when the component needs none: write `any(h, { key, props: {} })`. In exchange, those calls keep the key/ref, ref and callback checks.
