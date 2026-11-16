---
"@effect/ui": minor
---

Components are now callable: declare a child slot with `Editor(h, { key, props })` instead of `h.child(Editor, { key, props })`. This works for plain, provided and headless components. Feature services render with `Todos.render(h, { ref, fallback })`. `h.child` is removed.

Calling a component whose props are erased, such as a `Component.Any` or a component defined with `props: Schema.Any`, now requires `props`, even when the component needs none: write `any(h, { key, props: {} })`. In exchange, those calls keep the key/ref, ref and callback checks.

A component keeps what `Component.define` returned as its `definition`, and its name moves there: read `Editor.definition.name` instead of `Editor.name`. A component is now a function, so `Editor.name` is the function's own name. `Component.define` still takes the `name` option, and `provide` keeps the same `definition`. The component's other fields, such as `props` and `message`, stay where they are.
