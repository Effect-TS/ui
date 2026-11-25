---
"@effect/ui": minor
---

`Query.Service`, `Query.InfiniteService`, and `Command.Service` no longer take an implementation argument or provide a built-in `.layer`; move implementations to `static readonly layer = this.toLayer(...)` (or override in tests with `MyService.toLayer(fn)`). For `Command.Service`, also declare a `success` Schema (and optional `error` Schema, defaulting to `Schema.Never`) in options, using `Component.Noop` for silent Commands.
