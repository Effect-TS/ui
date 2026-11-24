---
"@effect/ui": patch
---

Smaller bundles: a mount carries only the features an app uses. Hydration, the HTML head fold and sync, the message log recorder, server rendering and the test hooks are each bundled only by the module that needs them. Measured with `pnpm bundle-size` (Vite, production, gzip), against `main` before this change:

| App             |    Before |     After |
| --------------- | --------: | --------: |
| counter         |  83,231 B |  58,721 B |
| features        |  84,058 B |  62,014 B |
| routing example | 127,154 B | 119,460 B |
