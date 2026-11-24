---
"@effect/ui": patch
---

`MessageLog.fanout` keeps the other services its Layers provide, such as the `BrowserHost.Pausables` from `DevTools.layer`, instead of dropping them.
