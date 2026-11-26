---
"@effect/ui": patch
---

Plain Html now omits URL attributes containing `javascript:` or `vbscript:` URLs during server rendering, browser rendering, hydration and head sync. Blocked URL property writes on built-in elements remove the reflected attribute; custom element properties are unchanged.
