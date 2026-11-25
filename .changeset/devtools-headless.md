---
"@effect/ui-devtools": minor
"@effect/ui": minor
---

Add `DevToolsHeadless.layer`, which sends a terminal app's log to the DevTools server, and a page at the server's URL that shows the newest session and follows it live. Inspect an OpenTUI app by running `effect-ui-devtools` and opening the URL it prints. `MessageLog.WireHost` gains `"terminal"`.
