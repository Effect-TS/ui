---
"@effect/ui": minor
---

`Query.Service`, `Query.InfiniteService`, and `Command.Service` now take only `(name, options)` without an implementation argument or built-in `.layer`. `Command.Service` options take a required `success` Schema and an optional `error` Schema (defaulting to `Schema.Never`), both exposed on the class next to `args`, and `Component.Noop` is now also a Schema for silent Commands. Attach a function or an Effect that builds one with `toLayer` (for example `static readonly layer = this.toLayer(...)` or `MyService.toLayer(fn)` for test overrides).
