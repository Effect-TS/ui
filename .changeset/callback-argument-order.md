---
"@effect/ui": minor
---

Reorder the arguments of a component's callbacks so the helper comes first, an unused Model no longer needs a placeholder, and callbacks that read the instance's state take one object.

- `update`, in both the function and the record form, `Def.update` and `$.combine` take `($, message)` in place of `(model, message, $)`. Read the Model from `$.model`. A handler that reads only `$` is `($) => $.evolve(...)`.
- `view` and `Def.view` take `(h, model)` in place of `(model, h)`, as `Def.fragment`, `h.lazy` and child calls do. A view that reads only props is `(h) => ...`.
- A headless component's `parts` takes `(p, model)` in place of `(model, p)`.
- `subscriptions`, `head` and a query's `args` take one object, `{ model, props, queries }`, in place of three arguments, like `h.keepAlive`'s predicate. `Component.Current` is its type.

```diff
- update: (model, message, $) => $.set(model + message.by),
- view: (model, h) => h.p([String(model)]),
- subscriptions: (_model, props) => [ticks(props.interval)],
+ update: ($, message) => $.set($.model + message.by),
+ view: (h, model) => h.p([String(model)]),
+ subscriptions: ({ props }) => [ticks(props.interval)],
```
