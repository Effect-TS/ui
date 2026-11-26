---
"@effect/ui": patch
---

A form with no `submit` handler now submits natively after mount or hydration when it posts or targets another window, instead of being cancelled. Same-window GET and `dialog` submissions are still cancelled.
