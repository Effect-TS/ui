---
"@effect/ui": minor
"@effect/ui-opentui": minor
---

Take one array in place of rest arguments, so a list built elsewhere goes in as it is and every call has the same shape for zero, one or many values.

- Element builders: `children`, the callable shorthand `h.div([...])`, `h.el(tag, [...])` and `class` take an array. `Html.classNames` takes an array of tokens.
- Update steps: `$.run`, `$.emit` and `$.combine` take an array of Commands, events or updates.
- `Route.union(routes, redirects)` takes its redirects as an array.
- Tests: `emitted` and `expectExact` on a `Story` or `Scene` take an array.

```diff
- h.ul.class("list", active && "active").children(h.li("One"), h.li("Two"))
+ h.ul.class(["list", active && "active"]).children([h.li(["One"]), h.li(["Two"])])
- $.set(model).run(save, notify)
+ $.set(model).run([save, notify])
```
