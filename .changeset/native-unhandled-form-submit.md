---
"@effect/ui": patch
---

After mount or hydration, forms without a `submit` handler now submit natively for POST or GET targeting another window instead of being cancelled. Same-window GET and `dialog` submissions remain cancelled.
