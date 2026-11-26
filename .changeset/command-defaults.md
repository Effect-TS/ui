---
"@effect/ui": minor
---

`Command.Service` options are all optional: `args` defaults to none, `success` to `Component.Noop` and `error` to `Schema.Never`, and a silent Service's body no longer needs `Effect.as(Component.noop)`. `args` is also optional on `Command.make` and `Mount.make`, and `args` and `error` on `Query.Service` and `Query.InfiniteService`.
