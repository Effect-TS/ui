---
"@effect/ui": minor
"@effect/ui-opentui": minor
---

Take one array in place of rest arguments, so a list built elsewhere goes in as it is and every call has the same shape for zero, one or many values.

- Element builders: `children`, the callable shorthand `h.div([...])`, `h.el(tag, [...])` and `class` take an array. `Html.classNames` takes an array of tokens.
- Update steps: `$.run`, `$.emit` and `$.combine` take an array of Commands, events or updates.
- `h.lazy(fn, args)` takes the arguments after `h` as one array, and `fn` still declares them as parameters. Leave `args` out for an `fn` that takes only `h`.
- A part takes the arguments after the builder as one array: `menu.item(h.li, [item])`. The array can be left out when `decorate` takes only the builder or only optional arguments. `View.PartArgs` is the type of that argument.
- `Route.union(routes, redirects)` takes its redirects as an array.
- Tests: `emitted` and `expectExact` on a `Story` or `Scene` take an array.

Optional trailing arguments are optional parameters, not rest tuples. The calls don't change, but the helper types do:

- `Command.MakeArgs` is now `Command.MakeArg`, the type of the one argument `make` takes.
- `Command.GroupArg` is the type of the group argument, not a tuple.
- `Scene.MountedResult` is the type of the result `mounted` takes, or `never` for a mount that returns nothing. `mounted(Mount, undefined)` ends the mount with `undefined` as its result.

```diff
- h.ul.class("list", active && "active").children(h.li("One"), h.li("Two"))
+ h.ul.class(["list", active && "active"]).children([h.li(["One"]), h.li(["Two"])])
- $.set(model).run(save, notify)
+ $.set(model).run([save, notify])
- h.lazy(row, item, item.id === selected)
+ h.lazy(row, [item, item.id === selected])
- listbox.option(h.li, option)
+ listbox.option(h.li, [option])
```
