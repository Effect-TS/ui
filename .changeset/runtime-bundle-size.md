---
"@effect/ui": patch
---

Smaller bundles: a mount carries only the features an app uses. Hydration, the HTML head fold and sync, the message log recorder, server rendering, test hooks, the `HtmlImages` loader, the `HtmlFiles` picker, readers and commands, `Query.InfiniteService` pagination, and `SubscriptionRef` are each bundled only when used. Measured with `pnpm bundle-size` (Vite, production, gzip), against `main` before this change:

| App             |    Before |     After |
| --------------- | --------: | --------: |
| counter         |  83,231 B |  56,015 B |
| features        |  84,058 B |  59,396 B |
| routing example | 127,154 B | 113,534 B |
