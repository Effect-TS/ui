---
"@effect/ui": patch
---

Skip closed part owners during DOM event lookup so removing a focused element inside a headless component's part no longer throws an outside-view error when browsers fire synchronous `blur` or `focusout` events during teardown.
