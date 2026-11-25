---
"@effect/ui": minor
---

`Query.Service` and `Query.InfiniteService` now take only `(name, options)` without a fetcher argument or built-in `.layer`. Attach a fetcher or an Effect that builds one with `toLayer` (for example `static readonly layer = this.toLayer(...)` or `MyQuery.toLayer(fn)` for test overrides).
