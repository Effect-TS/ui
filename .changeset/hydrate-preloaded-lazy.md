---
"@effect/ui": patch
---

Fix hydrating preloaded `Component.lazy` children so they decode saved state with the resolved component's schema and adopt the server-rendered DOM nodes instead of failing the root view.
