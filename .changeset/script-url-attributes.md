---
"@effect/ui": patch
---

Plain Html no longer writes `javascript:` or `vbscript:` URLs to URL attributes and properties such as `href` and `src`, on the server, in the browser, during hydration or in the head.
