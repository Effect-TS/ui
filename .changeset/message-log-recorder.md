---
"@effect/ui": patch
---

The code that builds `MessageLog` entries is loaded by the `MessageLog` module rather than by every mount. There is no new option, and no API change. A log can only be provided through `MessageLog` (`MessageLog.memory`, the socket and fanout logs, `DevTools.layer`, `TestHost`), so a mount that has a log to write to always has the recorder. An app that never imports `MessageLog` doesn't bundle it.
