---
"@effect/ui": patch
---

Smaller bundles: a mount carries only the features an app uses. Hydration, the HTML head fold and sync, the message log recorder, server rendering, test hooks, optional document services (`HtmlImages`, `HtmlFiles`), `Query.InfiniteService` pagination, and `SubscriptionRef` are each bundled only when used. Measured with `pnpm bundle-size` (Vite, production, gzip), against `main` before this change:

| App             |    Before |     After |
| --------------- | --------: | --------: |
| counter         |  83,231 B |  56,335 B |
| features        |  84,058 B |  59,714 B |
| routing example | 127,154 B | 114,034 B |
