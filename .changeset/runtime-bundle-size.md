---
"@effect/ui": patch
---

Smaller bundles: a mount carries only the features an app uses. Hydration, the HTML head fold and sync, the message log recorder, server rendering, test hooks, optional document services (`HtmlImages`, `HtmlFiles`, global events and animation frames), `Query.InfiniteService` pagination, and Effect's default logger/clock/`SubscriptionRef` are each bundled only when used. Measured with `pnpm bundle-size` (Vite, production, gzip), against `main` before this change:

| App             |    Before |     After |
| --------------- | --------: | --------: |
| counter         |  83,231 B |  53,314 B |
| features        |  84,058 B |  56,735 B |
| routing example | 127,154 B | 112,745 B |
