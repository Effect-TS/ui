---
"@effect/ui": patch
---

Expose typed `args`, `success` and `error` schemas on `Query.Service` and `Query.InfiniteService` classes, with `error` defaulting to `Schema.Never`. For infinite queries, `success` describes the array of pages, not a single page.
