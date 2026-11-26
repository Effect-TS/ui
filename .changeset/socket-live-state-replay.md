---
"@effect/ui": patch
---

`MessageLog.socket` now sends each session's start and the latest state of mounted instances to devtools that connect late, even after those entries left its buffer.
