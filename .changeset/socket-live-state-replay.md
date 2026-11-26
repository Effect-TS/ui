---
"@effect/ui": patch
---

Fix `MessageLog.socket` replay so devtools that connect after older entries leave the buffer still show mounted instances, their current props and query results, and waiting or running commands. Replaying retained state no longer makes completed commands appear to be waiting.
