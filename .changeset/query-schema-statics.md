---
"@effect/ui": patch
---

`Query.Service` and `Query.InfiniteService` classes expose their `args`, `success` and `error` Schemas as typed statics. Their type parameters are now Schemas, like `Command.Service`'s.
